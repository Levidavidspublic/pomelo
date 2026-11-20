interface SessionTimeoutButton {
  readonly label: string;
  readonly disabled?: boolean;
}

interface SessionTimeoutField {
  readonly type?: string;
  readonly autocomplete?: string;
  readonly name?: string;
  readonly label?: string;
  readonly value?: unknown;
}

export interface SessionTimeoutPageRead {
  readonly title?: string;
  readonly text?: string;
  readonly buttons?: readonly (string | SessionTimeoutButton)[];
  readonly items?: readonly string[];
  readonly fields?: readonly SessionTimeoutField[];
}

export interface SessionTimeoutOptions {
  /** Extensions already performed for this job. */
  readonly extendedCount?: number;
  readonly maxExtends?: number;
}

export type SessionTimeoutDecision = {
  reason: string;
  signals: string[];
} & (
  | { action: "go" | "hold"; label?: never }
  | { action: "press"; label: string }
);

const DEFAULT_MAX_EXTENDS = 3;
const TIMEOUT_WORDING = [
  /\bsession (?:is about to expire|will expire in)\b/,
  /\byou(?: will|'ll) be (?:signed|logged) out in\b/,
  /\bare you still there\b|\bstill working\s*\?/,
  /(?:החיבור|הסשן|המושב|ההפעלה|ההתחברות)(?: שלך)? עומדת?(?: בקרוב)? ל(?:פוג|הסתיים)/u,
  /תוקף (?:החיבור|הסשן|המושב|ההפעלה|ההתחברות)(?: שלך)? (?:יפוג בקרוב|עומד לפוג)/u,
  /(?:תנותק(?:י|ו)?(?: מהחשבון)?|החיבור ינותק) בעוד|(?:האם )?את(?:ה|ם|ן)? עדיין (?:שם|כאן|עובד(?:ת|ים|ות)?)|עדיין עובד(?:ת|ים|ות)?\s*\?/u,
];
const SESSION_ENDED_WORDING = [
  /\bsession (?:has (?:been )?|was |is )?(?:(?:already|now) )?(?:expired|ended|timed out)\b/,
  /\byou(?: have been| were| are|'ve been|'re) (?:already )?(?:signed|logged) out\b/,
  /פג תוקף (?:החיבור|הסשן|המושב|ההפעלה|ההתחברות)|תוקף (?:החיבור|הסשן|המושב|ההפעלה|ההתחברות)(?: שלך)? פג|(?:החיבור|הסשן|המושב|ההפעלה)(?: שלך)? (?:הסתיי(?:ם|מה)|פג(?:ה)?)|יצאת מהחשבון|נותקת מהחשבון/u,
];
const PASSWORD_REQUEST = /\b(?:confirm|enter|re[- ]?enter|verify|provide) (?:your |the )?(?:current )?password\b|(?:לאשר|לאמת|להזין|להקליד|אשר(?:י|ו)?|אמת(?:י|ו)?|הזן|הזיני|הזינו|הקלד(?:י|ו)?) (?:בבקשה )?(?:את )?(?:ה)?סיסמ[הא]|(?:אישור|אימות) סיסמ[הא]/u;
const PASSWORD_FIELD = /^(?:password|passwd|(?:confirm|current)[ _-]password|סיסמ[הא]|(?:אישור|אימות) סיסמ[הא])$/u;
const PASSWORD_AUTOCOMPLETE = /(?:^|\s)(?:current|new)-password(?=\s|$)/;
const STAY_LABEL = /^(?:stay signed in|continue session|keep me signed in|i'm still here|extend session)$/;
const HEBREW_STAY_LABEL = /^(?:(?:הי?שאר(?:י|ו)?|להישאר) מחובר(?:ת|ים|ות)?|(?:השאר(?:י|ו)?|השאירו) אותי מחוברת?|אני עדיין (?:כאן|פה)|(?:המשך|המשיכי|המשיכו|הארך|האריכי|האריכו)(?: את)? ה?(?:חיבור|סשן|מושב|הפעלה|התחברות)|המשך חיבור לחשבון)$/u;
const NUMBERED_ITEM = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\]|\\.)*")(?=$| = | → )/i;
const NUMBERED_BUTTON = /^(?:button|field:(?:submit|button))$/;

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").replace(/[‘’]/g, "'")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizedLabel(label: string): string {
  return normalize(label).replace(/[.!…]+$/, "").trimEnd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isList(value: unknown, valid: (item: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && [...value].every(valid));
}

function isPageRead(value: unknown): value is SessionTimeoutPageRead {
  return isRecord(value) && isOptionalText(value.title) && isOptionalText(value.text)
    && isList(value.items, (item) => typeof item === "string")
    && isList(value.buttons, (button) => typeof button === "string" || (isRecord(button)
      && typeof button.label === "string" && (button.disabled === undefined || typeof button.disabled === "boolean")))
    && isList(value.fields, (field) => isRecord(field)
      && [field.type, field.autocomplete, field.name, field.label].every(isOptionalText));
}

function numberedControls(items: readonly string[]): { kind: string; label: string }[] {
  return items.flatMap((item) => {
    // Friday writes the JSON label before any field value or link destination.
    const match = NUMBERED_ITEM.exec(item);
    if (!match) return [];
    return [{ kind: match[1].toLowerCase(), label: JSON.parse(match[2]) as string }];
  });
}

function isPasswordField({ type, autocomplete, name, label }: SessionTimeoutField): boolean {
  return normalize(type ?? "") === "password" || PASSWORD_AUTOCOMPLETE.test(normalize(autocomplete ?? ""))
    || PASSWORD_FIELD.test(normalizedLabel(name ?? "")) || PASSWORD_FIELD.test(normalizedLabel(label ?? ""));
}

function isStayButton({ label }: SessionTimeoutButton): boolean {
  const normalized = normalizedLabel(label);
  return STAY_LABEL.test(normalized) || HEBREW_STAY_LABEL.test(normalized);
}

function unreadablePage(): SessionTimeoutDecision {
  return { action: "hold", reason: "Amit needs to check the unreadable page.", signals: ["unreadable-page"] };
}

/** Decide from masked page facts. The browser job owns any press and tracks its extension count. */
export function sessionTimeoutRule(pageRead?: unknown, options: SessionTimeoutOptions = {}): SessionTimeoutDecision {
  try {
    if (!isPageRead(pageRead)) return unreadablePage();
    const { title = "", text = "", buttons = [], fields = [], items = [] } = pageRead;
    const numbered = numberedControls(items);
    const structured = buttons.map((button) => typeof button === "string" ? { label: button } : button);
    if (![title, text, ...structured.map(({ label }) => label), ...numbered.map(({ label }) => label)]
      .some((value) => value.trim())) return unreadablePage();

    const copy = [normalize(title), normalize(text)];
    if (SESSION_ENDED_WORDING.some((pattern) => copy.some((value) => pattern.test(value)))) {
      return { action: "go", reason: "The session has ended. Defer to the signed-out stop rule.",
        signals: ["defer-to-signed-out"] };
    }
    if (!TIMEOUT_WORDING.some((pattern) => copy.some((value) => pattern.test(value)))) {
      return { action: "go", reason: "No session timeout prompt was found.", signals: [] };
    }
    if (copy.some((value) => PASSWORD_REQUEST.test(value)) || fields.some(isPasswordField)
      || numbered.some(({ kind }) => kind === "field:password")) {
      return { action: "hold", reason: "The timeout prompt asks for a password. Wait for Amit.", signals: ["password-required"] };
    }

    const { extendedCount = 0, maxExtends = DEFAULT_MAX_EXTENDS } = options;
    if (!Number.isSafeInteger(extendedCount) || extendedCount < 0 || !Number.isSafeInteger(maxExtends) || maxExtends < 0) {
      return { action: "hold", reason: "Amit needs to check the session extension count and limit.", signals: ["invalid-extension-limit"] };
    }
    if (extendedCount >= maxExtends) {
      return { action: "hold", reason: "The job reached its session extension limit. Wait for Amit.", signals: ["extension-limit"] };
    }

    const structuredStay = structured.filter(isStayButton);
    const numberedStay = numbered.filter((control) => NUMBERED_BUTTON.test(control.kind) && isStayButton(control));
    // Both lists can describe the same button. Repeated buttons within either list are ambiguous.
    const [choice, otherChoice]: SessionTimeoutButton[] = [...structuredStay, ...numberedStay.filter(({ label }) =>
      !structuredStay.some((button) => normalizedLabel(button.label) === normalizedLabel(label)))];
    if (otherChoice || numberedStay.length > 1) {
      return { action: "hold", reason: "The timeout prompt offers more than one stay button. Wait for Amit.",
        signals: ["multiple-stay-buttons"] };
    }
    if (!choice || choice.disabled === true) {
      return { action: "hold", reason: "The timeout prompt has no clear stay button. Wait for Amit.", signals: ["no-stay-button"] };
    }
    return { action: "press", label: choice.label, reason: "The timeout prompt offers one clear stay button.",
      signals: ["session-timeout", choice.label] };
  } catch {
    // Malformed page facts can throw with page data in the error.
    return unreadablePage();
  }
}
