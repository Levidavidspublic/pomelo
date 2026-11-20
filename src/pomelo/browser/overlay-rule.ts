export interface OverlayElement {
  readonly ref: number;
  readonly role: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly isDefault?: boolean;
}

interface PageOverlay {
  readonly blocksPage: boolean;
  readonly title?: string;
  readonly text?: string;
  /** Visible controls scoped to the overlay, using the current page read's references. */
  readonly elements: readonly OverlayElement[];
}

export interface OverlayPageRead {
  readonly title?: string;
  readonly url?: string;
  readonly text?: string;
  readonly cut?: boolean;
  /** Friday's optional flat list of numbered controls. */
  readonly items?: readonly string[];
  readonly overlay?: PageOverlay | null;
  /** Browser-supplied flag for a native dialog outside the page. */
  readonly browserDialog?: boolean;
}

export interface OverlayRuleOptions {
  /** Consecutive closes already performed on this page, tracked by the browser job. */
  readonly closesOnThisPage?: number;
}

export type OverlayDecision =
  | { action: "none"; otherRule?: true }
  | { action: "close"; ref: number }
  | { action: "hold"; reason: string };

const CLOSE_LABELS = new Set(["close", "no thanks", "not now", "dismiss", "×", "סגור", "לא תודה"]);
const SIGN_IN = /^(?:please )?(?:(?:sign|log)[ -]?in\b|התחברות|התחבר|היכנס|כניסה)/u;
const OTHER_RULE_HEADINGS = [
  /^(?:cookies$|cookie (?:banner|consent|notice|preferences|settings)\b|(?:הגדרות|העדפות) עוגיות)/u,
  SIGN_IN,
  /^(?:terms$|(?:new|updated|revised) terms\b|terms (?:of (?:service|use)|(?:and|&) conditions)\b|תנאי (?:השימוש|השירות)|תנאים והגבלות)/u,
  /^(?:(?:re|h)?captcha\b|just a moment(?:[.!…]|$))/,
];
const OTHER_RULE_PROMPTS = [
  /\b(?:we use|this (?:site|website) uses|(?:accept|reject) all) cookies\b|אנו משתמשים בעוגיות/u,
  /\b(?:(?:updated|revised) (?:our |the )?terms\b|(?:accept|agree to) (?:our |the |these )?terms\b)/,
  /\b(?:(?:verify|confirm) (?:that )?you(?: are|['’]re) (?:human|not a robot)|are you human|i(?: am|['’]m) not a robot|complete the captcha)\b/,
];
const NUMBERED_REF = /^\[(\d+)\]\s+\S+/;
const NUMBERED_BUTTON = /^\[\d+\]\s+button\s+("(?:[^"\\]|\\.)*")$/;

function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOverlay(value: unknown): value is PageOverlay {
  return isRecord(value) && typeof value.blocksPage === "boolean"
    && isOptionalText(value.title) && isOptionalText(value.text)
    && Array.isArray(value.elements) && value.elements.every((element: unknown) =>
      isRecord(element) && typeof element.ref === "number" && typeof element.role === "string"
      && typeof element.label === "string" && (element.disabled === undefined || typeof element.disabled === "boolean"));
}

function isPageRead(value: unknown): value is OverlayPageRead {
  return isRecord(value) && isOptionalText(value.title) && isOptionalText(value.text)
    && (value.items === undefined || (Array.isArray(value.items) && value.items.every((item) => typeof item === "string")))
    && (value.browserDialog === undefined || typeof value.browserDialog === "boolean")
    && (value.overlay == null || isOverlay(value.overlay));
}

function usesOtherRule(title: string, text: string): boolean {
  const firstLine = text.trimStart().split(/\r?\n/, 1)[0];
  return [title, firstLine].map(normalize).some((heading) => OTHER_RULE_HEADINGS.some((rule) => rule.test(heading)))
    || OTHER_RULE_PROMPTS.some((rule) => rule.test(normalize(`${title} ${text}`)));
}

function matchesNumberedButton(items: readonly string[], choice: OverlayElement): boolean {
  const [item, duplicate] = items.filter((line) => Number(NUMBERED_REF.exec(line)?.[1]) === choice.ref);
  if (item === undefined || duplicate !== undefined) return false;

  // Read only the label of a button. Numbered fields may carry a value after their label.
  const label = NUMBERED_BUTTON.exec(item)?.[1];
  if (label === undefined) return false;
  try {
    return normalize(JSON.parse(label) as string) === normalize(choice.label);
  } catch {
    return false;
  }
}

/** Decide from masked page facts. The browser job owns the click and the close count. */
export function overlayRule(pageRead?: unknown, opts: OverlayRuleOptions = {}): OverlayDecision {
  if (!isPageRead(pageRead)) return { action: "hold", reason: "page not readable" };

  const { title = "", text = "", items = [], overlay, browserDialog } = pageRead;
  if (browserDialog === true) return { action: "none", otherRule: true };
  if (!overlay) {
    if (!title.trim() && !text.trim() && !items.some((item) => NUMBERED_REF.test(item))) {
      return { action: "hold", reason: "page not readable" };
    }
    return usesOtherRule(title, text) ? { action: "none", otherRule: true } : { action: "none" };
  }

  const { elements } = overlay;
  if (usesOtherRule(overlay.title ?? "", overlay.text ?? "") || elements.some(({ role, label }) =>
    role === "field:password" || ((role === "button" || role === "checkbox") && usesOtherRule(label, "")))) {
    return { action: "none", otherRule: true };
  }
  if (!overlay.blocksPage) return { action: "none" };
  if ((opts.closesOnThisPage ?? 0) >= 2) {
    return { action: "hold", reason: "This page's overlay has already been closed twice. Wait for Amit." };
  }

  const [choice, otherChoice] = elements.filter(({ role, label, disabled }) =>
    role === "button" && disabled !== true && CLOSE_LABELS.has(normalize(label)));
  if (otherChoice) {
    return { action: "hold", reason: "The overlay has more than one close button. Wait for Amit." };
  }
  if (!choice || !Number.isSafeInteger(choice.ref) || choice.ref <= 0
    || elements.filter(({ ref }) => ref === choice.ref).length !== 1
    || (items.length > 0 && !matchesNumberedButton(items, choice))) {
    return { action: "hold", reason: "The overlay has no clear close button. Wait for Amit." };
  }
  return { action: "close", ref: choice.ref };
}
