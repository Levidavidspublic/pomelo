interface SecurityQuestionField {
  readonly label?: string;
  readonly name?: string;
  readonly type: string;
  readonly masked?: boolean;
}

/** A masked page read with visible text and separate field metadata. */
export interface SecurityQuestionPageRead {
  readonly title?: string;
  readonly text?: string;
  readonly items?: readonly string[];
  readonly fields?: readonly SecurityQuestionField[];
}

const ALLOWED_ANSWERS = Object.freeze(["I answered it myself", "Cancel the job"] as const);
const FORBIDDEN_ACTIONS = Object.freeze([
  "type into the answer field",
  "forgot answer",
  "try another way",
  "skip",
] as const);

export const SECURITY_QUESTION_WORDS = Object.freeze({
  prompts: Object.freeze([
    /(?<![\p{L}\p{N}\p{M}])(?:security questions?|secret questions?|first (?:pet|school)|maiden name|(?:city|town) (?:you were|were you) born|where were you born)(?![\p{L}\p{N}\p{M}])/iu,
    /(?<![\p{L}\p{N}\p{M}])(?:שאל(?:ת|ות) ה?(?:אבטחה|ביטחון|סוד)|חיית המחמד הראשונה|שם הנעורים|בית הספר הראשון|(?:באיזו עיר|איפה|היכן) נולדת|עיר הלידה שלך)(?![\p{L}\p{N}\p{M}])/u,
  ]),
  answers: Object.freeze([
    /(?<![\p{L}\p{N}\p{M}])(?:security|secret)(?: question)? answer(?![\p{L}\p{N}\p{M}])/iu,
    /(?<![\p{L}\p{N}\p{M}])(?:תשובת אבטחה|תשובה לשאלת ה?(?:אבטחה|ביטחון|סוד))(?![\p{L}\p{N}\p{M}])/u,
  ]),
});
for (const words of Object.values(SECURITY_QUESTION_WORDS)) words.forEach(Object.freeze);

export type SecurityQuestionStopResult =
  | { stop: false }
  | {
      stop: true;
      status: "waiting";
      reason: "security_question";
      fieldCount: number;
      card: { line: string; allowedAnswers: typeof ALLOWED_ANSWERS };
      forbiddenActions: typeof FORBIDDEN_ACTIONS;
    };

const TEXT_FIELD = /^(?:text|textarea|textbox)$/i;
const OTHER_FIELD = /^(?:search\b|חיפוש|username\b|user name\b|שם משתמש|e-?mail\b|אימייל|דואר אלקטרוני|password\b|סיסמ[הא])/iu;
const ANSWER_FIELD = /^(?:your answer|answer|תשובה|התשובה שלך)[\s:*]*$/iu;
const TEXT_ITEM = /^\[\d+\]\s+(?:heading|paragraph|text|alert|status|generic|dialog|label)\s+("(?:[^"\\]|\\.)*")$/i;

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Bidi_Control}]/gu, "").replace(/\s+/g, " ").trim();
}

function itemText(item: string): string {
  if (!/^\[\d+\]/.test(item)) return item;
  // Friday appends a field value or link destination after the quoted label.
  const quoted = TEXT_ITEM.exec(item)?.[1];
  return quoted === undefined ? "" : JSON.parse(quoted);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function hold(line: string, fieldCount: number): SecurityQuestionStopResult {
  return {
    stop: true,
    status: "waiting",
    reason: "security_question",
    fieldCount,
    card: { line, allowedAnswers: ALLOWED_ANSWERS },
    forbiddenActions: FORBIDDEN_ACTIONS,
  };
}

/** Classifies only the current masked page and returns a fixed handoff for Amit. */
export function checkSecurityQuestion(read: unknown): SecurityQuestionStopResult {
  const unreadable = () => hold("Amit, the page could not be read. Please check it yourself.", 0);
  try {
    if (!isRecord(read)) return unreadable();
    const { title, text, items = [], fields = [] } = read;
    if (!isOptionalString(title) || !isOptionalString(text) || !Array.isArray(items) || !Array.isArray(fields)) {
      return unreadable();
    }

    const visible = [title ?? "", text ?? ""];
    for (const item of items) {
      if (typeof item !== "string") return unreadable();
      visible.push(itemText(item));
    }

    let fieldCount = 0;
    let hasAnswerField = false;
    let hasPossibleAnswerField = false;
    for (const field of fields) {
      if (!isRecord(field)) return unreadable();
      const { label, name, type, masked } = field;
      if (!isOptionalString(label) || !isOptionalString(name) || typeof type !== "string" || !type.trim()
        || (masked !== undefined && typeof masked !== "boolean")) return unreadable();

      fieldCount++;
      const fieldType = type.trim();
      const isText = TEXT_FIELD.test(fieldType);
      const isPassword = /^password$/i.test(fieldType);
      if (!isText && !isPassword) continue;

      const fieldLabel = normalize(label ?? "");
      const fieldName = normalize((name ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\p{Pd}]+/gu, " "));
      const identity = [fieldLabel, fieldName];
      hasAnswerField ||= SECURITY_QUESTION_WORDS.answers.some((pattern) => identity.some((part) => pattern.test(part)))
        || SECURITY_QUESTION_WORDS.prompts.some((pattern) => pattern.test(fieldLabel));
      hasPossibleAnswerField ||= identity.some((part) => ANSWER_FIELD.test(part))
        || (isText && !identity.some((part) => OTHER_FIELD.test(part)));
    }

    const wording = visible.map(normalize);
    if (fieldCount === 0 && !wording.some(Boolean)) return unreadable();
    if (hasAnswerField || (hasPossibleAnswerField && wording.some((part) =>
      SECURITY_QUESTION_WORDS.prompts.some((pattern) => pattern.test(part)),
    ))) {
      return hold("Amit, please answer the site's security question yourself.", fieldCount);
    }
    return { stop: false };
  } catch {
    // Read failures can contain page data.
    return unreadable();
  }
}
