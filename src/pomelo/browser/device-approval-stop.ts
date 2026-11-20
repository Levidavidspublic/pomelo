import { checkOneTimeCodeStop } from "./otp-stop.js";

type MaskedPageRead = Parameters<typeof checkOneTimeCodeStop>[0];
type MaskedElement = NonNullable<MaskedPageRead["elements"]>[number];
type ApprovalKind = "phone-prompt" | "email-link" | "new-device" | "unknown";

export type DeviceApprovalStopResult = {
  card: { title: string; body: string };
} & (
  | { stop: true; kind: ApprovalKind; reason: string; blockedActions: string[] }
  | { stop: false; kind: null; reason: null; blockedActions: [] }
);

const PROMPTS: ReadonlyArray<readonly [ApprovalKind, readonly RegExp[]]> = [
  ["phone-prompt", [
    /\b(?:tap|select|choose) (?:yes|approve|(?:the number )?\p{Nd}+|the (?:matching )?number(?: shown here)?) (?:on|in) (?:your|the) (?:phone|(?:authenticator )?app)\b/iu,
    /\bcheck your phone\b[^.!?]*[.!?]?\s*(?:and )?(?:tap|select|choose) (?:yes|approve|(?:the number )?\p{Nd}+)\b/iu,
    /\b(?:approve|confirm) (?:(?:this|the|your) )?(?:(?:sign[ -]?in|log[ -]?in)(?: request)?|request|notification) (?:on|in|using|with) (?:your |the )?(?:phone|mobile device|[\w ]{0,40}\bapp)\b/i,
    /\b(?:open|check) (?:your |the )?(?:[\w ]{0,40}\bapp|phone) (?:and|to) (?:approve|confirm) (?:this|the|your) (?:sign[ -]?in|log[ -]?in|request)\b/i,
    /\b(?:sent|sending) (?:you )?(?:an? )?(?:sign[ -]?in (?:request|notification)|push notification) to your phone\b/i,
    /(?:אשר(?:י|ו)?|לאשר|אישור) (?:את )?(?:בקשת )?(?:הכניסה|ההתחברות|כניסה|התחברות) (?:ב|דרך ה?)(?:טלפון|נייד|אפליקצי[הת])/u,
    /(?:הקש(?:י|ו)?|לחץ|בחר) (?:על )?(?:כן|אישור|(?:המספר )?\p{Nd}+) (?:ב|על ה)(?:טלפון|נייד|אפליקציה)/u,
  ]],
  ["email-link", [
    /\bcheck your e-?mail (?:to|and) (?:confirm (?:that )?it's you|(?:confirm|approve|verify) (?:your|the|this) sign[ -]?in)\b/i,
    /\b(?:e-?mailed you|sent you|sent) (?:an? |the )?(?:sign[ -]?in|confirmation|verification) link\b/i,
    /\b(?:sent|e-?mailed) (?:you )?(?:an? |the )?link\b.{0,160}\b(?:confirm (?:that )?it's you|(?:confirm|approve|verify) (?:your|the|this) sign[ -]?in)\b/i,
    /\b(?:open|follow|click|use) (?:the |your )?(?:confirmation |verification |sign[ -]?in )?link (?:in|from) (?:your|the) e-?mail\b/i,
    /\b(?:sent (?:you )?(?:an? )?e-?mail|check your e-?mail)\b.{0,140}\b(?:open|follow|click|use) the link\b/i,
    /(?:פתח(?:י|ו)?|לחץ|לחצו|לפתוח) (?:(?:את|על) )?ה?קישור[^.!?]{0,70}(?:בדוא["״]?ל|במייל|בדואר האלקטרוני)/u,
    /בד(?:ו?ק|קו) את (?:הדוא["״]?ל|המייל|הדואר האלקטרוני)(?: שלך)? כדי (?:לאשר|לאמת)/u,
  ]],
  ["new-device", [
    /\b(?:we (?:don't|do not) recogni[sz]e this device|we (?:haven't|have not) seen this device before)\b/i,
    /\b(?:(?:new|unrecogni[sz]ed) device detected|we detected (?:a new|an unrecogni[sz]ed) device)\b/i,
    /\b(?:sign(?:ing)?[ -]?in|log(?:ging)?[ -]?in) (?:from|on) (?:a |an )?(?:new|unrecogni[sz]ed) device\b/i,
    /\b(?:new device|(?:unusual|suspicious|unrecogni[sz]ed) (?:sign[ -]?in|log[ -]?in))\b.{0,120}\b(?:(?:confirm|verify) (?:that )?it's you|verify your identity)\b/i,
    /(?:איננו|אנחנו לא|לא) מזהים את המכשיר הזה|זיהינו מכשיר (?:חדש|לא מוכר)/u,
    /(?:מכשיר (?:חדש|לא מוכר)|(?:כניסה|התחברות) (?:חריגה|חשודה))[^.!?]{0,100}(?:אשר(?:ו)? שזה אתה|אמת(?:ו)? את זהותך)/u,
  ]],
  ["unknown", [
    /\b(?:waiting for (?:(?:your|an?) )?(?:sign[ -]?in|log[ -]?in) approval|(?:sign[ -]?in|log[ -]?in) approval (?:is )?required)\b/i,
    /\b(?:approve|confirm) (?:this|the|your) (?:sign[ -]?in|log[ -]?in) on another device\b/i,
    /ממתינים לאישור (?:הכניסה|ההתחברות)|נדרש אישור (?:כניסה|התחברות)/u,
  ]],
];

const COPY: Record<ApprovalKind, { title: string; instruction: string }> = {
  "phone-prompt": { title: "Approve the sign-in on your phone", instruction: "approve the sign-in in the prompt on your phone" },
  "email-link": { title: "Open the sign-in confirmation link", instruction: "open the confirmation link in your email" },
  "new-device": { title: "Confirm this sign-in", instruction: "follow the site's instructions to confirm it's you" },
  unknown: { title: "Approve the sign-in", instruction: "follow the site's instructions to approve the sign-in" },
};

// Return known labels only. Page-controlled labels can contain masked or unmasked fragments.
const BLOCKED_LABELS: readonly string[] = [
  "Resend", "Send again", "Try another way", "Use a different method", "I don't have my phone", "Remember this device",
  "Resend notification", "Send notification again", "Resend email", "Resend link", "Try another method",
  "שלח שוב", "שליחה מחדש", "נסה דרך אחרת", "נסו דרך אחרת", "שימוש בשיטה אחרת", "אין לי את הטלפון שלי", "זכור את המכשיר הזה",
];
const BLOCKED_ACTIONS = new Map(BLOCKED_LABELS.map((label) => [normalize(label), label]));
const ITEM = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\]|\\.)*")(?=$| [→=] )/;
const CONTROL = /^(?:button|submit|checkbox|link)$/i;
const PROSE = /^(?:heading|paragraph|text|alert|status|generic|dialog)?$/i;
const HELP_TITLE = /\b(?:help (?:center|centre|article)|support article|troubleshoot(?:ing)?)\b|^how to\b|מרכז העזרה|מאמר עזרה/u;
const CODE_LABEL = /\b(?:otp|totp|mfa code|2fa code|passcode|(?:one[ -]time|verification|security|authentication|confirmation|sign[ -]?in) code)\b|^code$|קוד (?:אימות|חד[ -]פעמי)/iu;
const CODE_ENTRY = /\b(?:enter|type) (?:the |your )?(?:(?:verification|one[ -]time|\d[ -]digit) )?(?:code|passcode) (?:below|here|in (?:the|this) (?:box|field))\b|(?:הזן|הקלד) את הקוד (?:כאן|למטה)/iu;

function normalize(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase()
    .replace(/[\u0591-\u05bd\u05bf-\u05c2\u05c4-\u05c5\u05c7\p{Bidi_Control}]/gu, "")
    .replace(/\p{Pd}/gu, "-")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?:…]+$/, "") : "";
}

function readItem(item: string): MaskedElement {
  const match = ITEM.exec(item);
  if (!match) return /^\[\d+\]/.test(item) ? {} : { text: item };
  const role = match[1]!.toLowerCase();
  // Friday puts any field value or link target after the JSON label.
  try {
    const label: string = JSON.parse(match[2]!);
    return role.startsWith("field:") ? { type: role.slice(6), label } : { role, label };
  } catch {
    return {};
  }
}

function labels({ name, label, text }: MaskedElement): string[] {
  return [name, label, text].map(normalize).filter(Boolean);
}

function isCodeInput(element: MaskedElement, prompt: string): boolean {
  const role = normalize(element.role);
  const type = normalize(element.type);
  const editableRole = /^(?:input|textbox|spinbutton)$/.test(role);
  const editableType = /^(?:text|tel|number|password)$/.test(type);
  if (!(editableRole || editableType) || (role && !editableRole) || (type && !editableType)) return false;
  const fieldLabels = labels(element);
  if (fieldLabels.length === 0) return CODE_ENTRY.test(prompt);
  return fieldLabels.some((label) =>
    !/\b(?:card|cvv|cvc)\b/.test(label) && CODE_LABEL.test(label.replaceAll("_", " ")),
  );
}

function siteName(url: string | undefined): string {
  try {
    const site = new URL(url ?? "");
    if (/^https?:$/.test(site.protocol)) return site.hostname;
  } catch {
    // A read can have a missing or invalid address.
  }
  return "This site";
}

/** Classifies a masked read so the caller can hold the browser job for Amit. */
export function deviceApprovalStop(read: MaskedPageRead): DeviceApprovalStopResult {
  const noStop = (): DeviceApprovalStopResult => ({
    stop: false, kind: null, reason: null, card: { title: "", body: "" }, blockedActions: [],
  });

  const title = normalize(read.title);
  if (HELP_TITLE.test(title)) return noStop();
  const items = (read.items ?? []).map(readItem);
  const elements = [...(read.elements ?? []), ...(read.fields ?? []), ...items];
  const prose = elements.filter((element) => !element.type && PROSE.test(normalize(element.role))).flatMap(labels);
  const prompt = [title, normalize(read.text), ...prose].filter(Boolean).join(". ");
  if (/\bif you (?:see|receive|get)\b.{0,160}\b(?:this article|this guide)\b/i.test(prompt)) return noStop();

  const kind = PROMPTS.find(([, patterns]) => patterns.some((pattern) => pattern.test(prompt)))?.[0];
  if (!kind) return noStop();

  // Check each representation independently so a fields list cannot hide behind an elements list.
  if (elements.some((element) => isCodeInput(element, prompt)) || [read.elements, read.fields].some((controls) =>
    controls && checkOneTimeCodeStop({ title: read.title, text: read.text, elements: controls }).stop,
  )) return noStop();

  const blockedActions = new Set<string>();
  for (const element of elements) {
    if (!CONTROL.test(normalize(element.role)) && !CONTROL.test(normalize(element.type))) continue;
    const action = labels(element).map((label) => BLOCKED_ACTIONS.get(label)).find(Boolean);
    if (action) blockedActions.add(action);
  }

  const { title: cardTitle, instruction } = COPY[kind];
  return {
    stop: true,
    kind,
    reason: "The site is waiting for sign-in approval.",
    card: { title: cardTitle, body: `${siteName(read.url)} is waiting for sign-in approval. Amit, ${instruction}.` },
    blockedActions: [...blockedActions],
  };
}
