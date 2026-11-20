interface MaskedElement {
  role?: unknown;
  name?: unknown;
  label?: unknown;
  type?: unknown;
  autocomplete?: unknown;
  inputmode?: unknown;
  maxlength?: unknown;
  text?: unknown;
  value?: unknown;
}

interface MaskedPageRead {
  title?: string;
  url?: string;
  text?: string;
  cut?: boolean;
  items?: readonly string[];
  fields?: readonly MaskedElement[];
  elements?: readonly MaskedElement[];
}

type DeliveryKind = "sms" | "email" | "authenticator";
type StopReason = "one-time-code" | "single-character-boxes" | "verification-prompt";

type OneTimeCodeStop = {
  card: { title: string; body: string };
} & (
  | { stop: true; kind: DeliveryKind | "unknown"; reason: StopReason }
  | { stop: false; kind: null; reason: null }
);

const CODE_PROMPT = /\b(?:verification\s+code|enter\s+(?:the\s+)?code|one[\s\p{Pd}]+time\s+(?:code|passcode)|2[\s\p{Pd}]*step|2fa|two[\s\p{Pd}]+factor)\b|קוד\s+אימות/iu;
const DELIVERY_PROMPTS: ReadonlyArray<readonly [DeliveryKind, RegExp]> = [
  ["authenticator", /\bauthenticator(?:\s+app)?\b/i],
  ["sms", /\b(?:sms|text\s+message|sent\s+(?:you\s+)?a\s+text|texted\s+you)\b/i],
  ["email", /\b(?:check\s+your\s+e-?mail|e-?mailed|e-?mail\s+(?:verification\s+)?code|code\s+(?:to|by|via|from)\s+(?:your\s+)?e-?mail)\b/i],
];
const OTHER_FIELD = /\b(?:search|post[\s-]*code|postal[\s-]*code|zip(?:[\s-]*code)?|cc-[\w-]+|card[\s-]*(?:number|security|code)|cvv|cvc|(?:current|new)-password)\b/i;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function elementText({ name, label, text: visible }: MaskedElement): string {
  return [text(name), text(label), text(visible)].join("\n");
}

function isCodeBox(element: MaskedElement): boolean {
  const role = text(element.role).trim().toLowerCase();
  const type = text(element.type).trim().toLowerCase();
  if (role && !["input", "textbox", "spinbutton"].includes(role)) return false;
  if (type && !["text", "tel", "number", "password"].includes(type)) return false;
  if (!role && !type && element.maxlength === undefined) return false;

  const identity = [text(element.name), text(element.label), text(element.autocomplete)].join(" ");
  return !OTHER_FIELD.test(identity.replaceAll("_", "-"));
}

function fieldLength({ maxlength }: MaskedElement): number {
  return typeof maxlength === "number" ? maxlength : Number(text(maxlength));
}

function isShortNumericBox(element: MaskedElement): boolean {
  const length = fieldLength(element);
  const type = text(element.type).trim().toLowerCase();
  const mode = text(element.inputmode).trim().toLowerCase();
  return isCodeBox(element) && Number.isInteger(length) && length >= 4 && length <= 8
    && (type === "number" || type === "tel" || mode === "numeric" || mode === "tel");
}

function singleCharacterRow(elements: readonly MaskedElement[]): { first: number; last: number } | undefined {
  let count = 0;
  // A flat read represents a row as consecutive editable elements.
  for (let i = 0; i <= elements.length; i++) {
    const element = elements[i];
    if (element && isCodeBox(element) && fieldLength(element) === 1) {
      count++;
      continue;
    }
    if (count >= 4 && count <= 8) return { first: i - count, last: i - 1 };
    count = 0;
  }
  return undefined;
}

function nearbyText(elements: readonly MaskedElement[], first: number, last = first): string {
  const neighbors = [elements[first - 1], elements[last + 1]].filter((element) =>
    element && /^(?:heading|paragraph|label|text|generic|)$/i.test(text(element.role)) && !text(element.type),
  );
  return [...elements.slice(first, last + 1), ...neighbors].map(elementText).join("\n");
}

function isCodePrompt(prompt: string): boolean {
  return CODE_PROMPT.test(prompt) || DELIVERY_PROMPTS.some(([, pattern]) => pattern.test(prompt));
}

function codeKind(local: string, page: string): DeliveryKind | "unknown" {
  const nearby = DELIVERY_PROMPTS.filter(([, pattern]) => pattern.test(local));
  const matches = nearby.length ? nearby : DELIVERY_PROMPTS.filter(([, pattern]) => pattern.test(page));
  return matches.length === 1 ? matches[0]![0] : "unknown";
}

function siteName(url: string | undefined): string {
  try {
    const site = new URL(url ?? "");
    if (site.protocol === "http:" || site.protocol === "https:") return site.hostname;
  } catch {
    // The snapshot can omit the address or contain an invalid URL.
  }
  return "This site";
}

/** Inspect a masked page read and return the browser job's human-handoff decision. */
export function checkOneTimeCodeStop(maskedRead: MaskedPageRead): OneTimeCodeStop {
  const elements = maskedRead.elements ?? maskedRead.fields ?? [];
  const pagePrompt = [maskedRead.title, maskedRead.text].join("\n");

  let reason: StopReason = "one-time-code";
  let index = elements.findIndex(({ autocomplete }) => /(?:^|\s)one-time-code(?:\s|$)/i.test(text(autocomplete)));
  let row: ReturnType<typeof singleCharacterRow>;
  if (index === -1) {
    reason = "single-character-boxes";
    row = singleCharacterRow(elements);
    index = row?.first ?? -1;
  }
  if (index === -1) {
    reason = "verification-prompt";
    index = elements.findIndex((element, i) =>
      isShortNumericBox(element) && isCodePrompt(nearbyText(elements, i)),
    );
    if (index === -1 && isCodePrompt(pagePrompt)) index = elements.findIndex(isShortNumericBox);
  }
  if (index === -1) return { stop: false, kind: null, card: { title: "", body: "" }, reason: null };

  return {
    stop: true,
    kind: codeKind(nearbyText(elements, index, row?.last), pagePrompt),
    card: {
      title: "Enter your one-time code",
      body: `${siteName(maskedRead.url)} is waiting for a one-time code. Amit, type the code yourself on the page.`,
    },
    reason,
  };
}
