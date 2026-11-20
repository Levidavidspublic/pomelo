interface AgreementControl {
  readonly label: string;
  /** Visible text from the same prompt or form as the control. */
  readonly nearbyText?: string;
}

interface AgreementCheckbox extends AgreementControl {
  readonly checked: boolean;
}

interface AgreementButton extends AgreementControl {
  /** False when the read identifies a control that does not gate the page. */
  readonly blocksPage?: boolean;
}

export interface TermsPageRead {
  readonly title?: string;
  readonly text?: string;
  readonly checkboxes?: readonly AgreementCheckbox[];
  readonly buttons?: readonly AgreementButton[];
  /** Friday's numbered read can supply button and link labels. Checkbox state must be explicit. */
  readonly items?: readonly string[];
}

export interface TermsDecision {
  action: "go" | "hold";
  reason: string;
  signals: string[];
}

const LEGAL_WORDING = /\b(?:terms (?:of (?:service|use)|and conditions)|(?:new|updated|revised|our|the|accept|agree to) (?:terms|conditions)(?! of\b)|conditions of (?:use|service|sale)|contracts?|agreements?|subscriptions?)\b|\bterms\s*&\s*conditions\b|^(?:terms|conditions|תנאים)$|תנאי (?:השימוש|שימוש|השירות|שירות)|תנאים (?:והגבלות|חדשים|מעודכנים)|התקנון|הסכם|חוזה|מינוי|מנוי/u;
const LEGAL_HEADING = /^(?:terms (?:of (?:service|use)|(?:and|&) conditions)|privacy policy|service (?:contract|agreement)|תנאי (?:השימוש|השירות)|תנאים והגבלות|מדיניות (?:הפרטיות|פרטיות))$/u;
const PRIVACY_WORDING = /\bprivacy polic(?:y|ies)\b|מדיניות (?:הפרטיות|פרטיות)/u;
const PRIVACY_ACCEPTANCE = /\b(?:accept|agree to) (?:(?:the|our|this|new|updated|revised) )*privacy polic(?:y|ies)\b|(?:מאשר|מסכים|לאשר|להסכים) (?:את |ל)?מדיניות (?:הפרטיות|פרטיות)/u;
const PRIVACY_UPDATE = /\b(?:(?:new|updated|revised|changed) (?:our |the |this )?privacy polic(?:y|ies)|privacy polic(?:y|ies) (?:has (?:been )?|was )?(?:changed|updated|revised))\b|מדיניות (?:הפרטיות|פרטיות) (?:החדשה|המעודכנת|עודכנה)|עדכנ(?:ו|ה) (?:את )?מדיניות (?:הפרטיות|פרטיות)/u;
const ACCEPTANCE_PROMPT = /\b(?:accept|agree to|consent to|acknowledge|(?:updat|chang|revis)(?:e|ed|ing))\b|כדי להמשיך|לאשר|להסכים|עדכנ/u;
const PLAN_CHANGE = /\b(?:(?:new|paid) (?:plan|subscription)|(?:plan|subscription) (?:change|upgrade|downgrade)|(?:change|upgrade|downgrade) (?:to |your |the )*(?:plan|subscription))\b/;
const BILLING = /[$€£₪]\s*\d|\d[\d.,]*\s*(?:[$€£₪]|\b(?:usd|eur|gbp|ils)\b)|\b(?:paid plan|billed|billing|charged|per month|per year)\b|\/\s*(?:month|year)\b/u;
const COOKIE_WORDING = /\b(?:cookies?|tracking)\b|עוגיות|מעקב/u;
const COOKIE_CHOICE = /^(?:accept(?: all(?: cookies)?)?|reject(?: all)?|decline(?: all)?|agree|allow all|only necessary|(?:use )?necessary cookies only|manage (?:options|preferences|cookies)|cookie settings|(?:אשר|קבל|דחה) (?:הכל|הכול)|רק הכרחיות|עוגיות הכרחיות בלבד|ניהול העדפות|הגדרות עוגיות)$/u;
const COOKIE_BANNER_TEXT = /\b(?:use (?:optional |necessary )?cookies|cookie (?:consent|preferences|settings)|(?:allow|reject|disable) tracking|tracking (?:consent|preferences|settings))\b/;
const COOKIE_BANNER_CHOICE = /^(?:accept all(?: cookies)?|allow all|only necessary|(?:use )?necessary cookies only)$/;
const FOOTER_LINKS = /^(?:terms(?: of (?:service|use))?|privacy(?: policy)?)(?:\s*[·•|]\s*(?:terms(?: of (?:service|use))?|privacy(?: policy)?))+$/;

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase()
    .replace(/\s+/g, " ").trim().replace(/[.!?:…]+$/, "").trimEnd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isList(value: unknown, valid: (item: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && [...value].every(valid));
}

function isControl(value: unknown): value is Record<string, unknown> & AgreementControl {
  return isRecord(value) && typeof value.label === "string"
    && (value.nearbyText === undefined || typeof value.nearbyText === "string");
}

function isPageRead(value: unknown): value is TermsPageRead {
  return isRecord(value)
    && (value.title === undefined || typeof value.title === "string")
    && (value.text === undefined || typeof value.text === "string")
    && isList(value.checkboxes, (item) => isControl(item) && typeof item.checked === "boolean")
    && isList(value.buttons, (item) => isControl(item)
      && (item.blocksPage === undefined || typeof item.blocksPage === "boolean"))
    && isList(value.items, (item) => typeof item === "string");
}

function numberedControls(items: readonly string[]): { kind: string; label: string }[] {
  return items.flatMap((item) => {
    // The JSON string ends before any field value or link destination.
    const match = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\]|\\.)*")(?=$| = | → )/i.exec(item);
    if (!match) return [];
    try {
      return [{ kind: match[1].toLowerCase(), label: JSON.parse(match[2]) as string }];
    } catch {
      return [];
    }
  });
}

function contextsFor(control: AgreementControl, label: string, title: string, lines: readonly string[]): string[] {
  if (control.nearbyText !== undefined) return [control.nearbyText.split(/\r?\n/).map(normalize).join("\n")];

  const windowSize = 3;
  const neighbors = lines.flatMap((line, index) => line === label
    ? [[title, ...lines.slice(Math.max(0, index - windowSize), index),
      ...lines.slice(index + 1, index + 1 + windowSize)].filter(Boolean).join("\n")]
    : []);
  if (neighbors.length) return neighbors;
  // In a longer flat read, an unplaced control needs evidence of an actual prompt.
  const planChange = [label, title, ...lines].some((line) => PLAN_CHANGE.test(line));
  const fallback = lines.length <= windowSize ? lines : lines.filter((line) =>
    LEGAL_HEADING.test(line) || (LEGAL_WORDING.test(line) && ACCEPTANCE_PROMPT.test(line)) || privacyPrompt(line)
    || PLAN_CHANGE.test(line) || (planChange && BILLING.test(line)) || COOKIE_WORDING.test(line),
  );
  return [[title, ...fallback].filter(Boolean).join("\n")];
}

function checkboxSignal(label: string): string | undefined {
  const assent = /^(?:by (?:ticking|checking|selecting) this box,? )?i (?:(?:have )?read and )?(agree|accept)\b/.exec(label)?.[1];
  if (assent === "agree") return "I agree";
  if (assent === "accept") return "I accept";
  if (/^אני מסכי(?:ם|מה)(?:$|\s)/u.test(label)) return "אני מסכים";
  if (/^אני מאשר(?:ת)?(?:$|\s)/u.test(label)) return "אני מאשר";
  return undefined;
}

function buttonSignal(label: string): string | undefined {
  switch (label) {
    case "accept and continue": return "Accept and continue";
    case "agree and continue": return "Agree and continue";
    case "agree": return "Agree";
    case "accept": return "Accept";
    case "continue": return "Continue";
    case "confirm": return "Confirm";
    default:
      if (/^confirm (?:your |the )?new plan\b/.test(label)) return "Confirm your new plan";
      if (/^accept\b/.test(label) && (LEGAL_WORDING.test(label) || PRIVACY_WORDING.test(label))) return "Accept";
      if (/^agree to\b/.test(label) && (LEGAL_WORDING.test(label) || PRIVACY_WORDING.test(label))) return "Agree";
      return checkboxSignal(label);
  }
}

function privacyPrompt(text: string): boolean {
  return PRIVACY_ACCEPTANCE.test(text) || PRIVACY_UPDATE.test(text);
}

function legalAgreement(label: string, context: string, cookieChoice = false): boolean {
  return LEGAL_WORDING.test(label) || context.split("\n").some((line) => LEGAL_WORDING.test(line))
    || PRIVACY_WORDING.test(label) || privacyPrompt(context) || (!cookieChoice && PRIVACY_WORDING.test(context));
}

/** Classify masked page facts for the browser job's human handoff. */
export function termsStop(pageRead?: unknown): TermsDecision {
  const unreadable: TermsDecision = { action: "hold", reason: "A readable masked page read is required.", signals: [] };
  if (!isPageRead(pageRead)) return unreadable;

  const { title = "", text = "", checkboxes = [], buttons = [], items = [] } = pageRead;
  const numbered = numberedControls(items);
  const knownButtonLabels = new Set(buttons.map(({ label }) => normalize(label)));
  const numberedButtons = numbered.filter(({ kind, label }) =>
    /^(?:button|field:button|field:submit)$/.test(kind) && !knownButtonLabels.has(normalize(label)),
  );
  const allButtons = [...buttons, ...numberedButtons];
  if (![title, text, ...checkboxes.map(({ label }) => label), ...buttons.map(({ label }) => label),
    ...numbered.map(({ label }) => label)]
    .some((value) => value.trim())) return unreadable;

  const linkLabels = new Set(numbered.filter(({ kind }) => kind === "link").map(({ label }) => normalize(label)));
  const lines = text.split(/\r?\n/).map(normalize)
    .filter((line) => line && !FOOTER_LINKS.test(line) && !linkLabels.has(line));
  const pageTitle = normalize(title);
  const hasCheckedAgreement = checkboxes.some((control) => {
    const label = normalize(control.label);
    return control.checked && checkboxSignal(label) !== undefined
      && contextsFor(control, label, pageTitle, lines).some((context) => legalAgreement(label, context));
  });
  const controls = [
    ...checkboxes.filter(({ checked }) => !checked).map((control) => ({ control, match: checkboxSignal, canHold: true })),
    ...allButtons.map((control: AgreementButton) => ({ control, match: buttonSignal, canHold: control.blocksPage !== false })),
  ];
  const signals = new Set<string>();
  let cookieBanner = [pageTitle, ...lines].some((line) => COOKIE_BANNER_TEXT.test(line))
    && allButtons.some(({ label }) => COOKIE_BANNER_CHOICE.test(normalize(label)));

  for (const { control, match, canHold } of controls) {
    const label = normalize(control.label);
    const signal = match(label);
    for (const context of contextsFor(control, label, pageTitle, lines)) {
      const wording = [label, context].filter(Boolean).join("\n");
      const cookieChoice = COOKIE_CHOICE.test(label) && COOKIE_WORDING.test(wording);
      if (cookieChoice) cookieBanner = true;
      if (!canHold || !signal) continue;

      const paidChange = PLAN_CHANGE.test(wording) && BILLING.test(wording);
      const continuesCheckedAgreement = signal === "Continue" && hasCheckedAgreement;
      if (signal === "Confirm" && !paidChange) continue;
      if (signal === "Continue" && !paidChange && !continuesCheckedAgreement && !ACCEPTANCE_PROMPT.test(context)) continue;
      if (paidChange || continuesCheckedAgreement || legalAgreement(label, context, cookieChoice)) {
        signals.add(signal);
      }
    }
  }

  if (signals.size) {
    return { action: "hold", reason: "This page asks for an agreement that Amit needs to review.", signals: [...signals] };
  }
  if (cookieBanner) {
    return { action: "go", reason: "Cookie and tracking choices belong to the cookie-banner rule.",
      signals: ["Deferred to the cookie-banner rule"] };
  }
  return { action: "go", reason: "No agreement prompt was found.", signals: [] };
}
