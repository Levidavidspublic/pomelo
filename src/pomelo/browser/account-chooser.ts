import type { SignedOutPageRead as MaskedPageRead } from "./signed-out-stop.js";

type AccountChooserDecision =
  | { kind: "none" }
  | { kind: "pick"; ref: string }
  | { kind: "hold"; reason: string; seen: number };

const CHOOSER_PROMPT = [
  /^(?:choose|pick|select) (?:an|your) account(?: to continue)?[.!?:]?$/i,
  /^(?:(?:בחר(?:ו|י|\/י)?|(?:יש )?לבחור) ב?|בחירת |בחירה ב)חשבון(?: כדי להמשיך)?[.!?:]?$/u,
];

const ACCOUNT_MANAGEMENT = [
  /^(?:use|sign[ -]in with) (?:another|a different) account[.!?:]?$/i,
  /^(?:add|remove) (?:an? |another )?account[.!?:]?$/i,
  /^(?:השתמש(?:ו|י)?|שימוש|להשתמש) בחשבון (?:אחר|נוסף)[.!?:]?$/u,
  /^(?:הוספת|הוסף|הוסיפו|הוסיפי|הסרת|הסרה של|הסר|הסירו|הסירי) חשבון[.!?:]?$/u,
  /^(?:כניסה|התחברות|היכנס(?:ו|י)?|התחבר(?:ו|י)?) (?:עם חשבון|באמצעות חשבון|בחשבון|לחשבון) (?:אחר|שונה)[.!?:]?$/u,
];

// The desktop reader serializes the label as JSON before any link target or field value.
const ACCOUNT_ITEM = /^\[([1-9]\d*)\]\s+(?:button|link|menuitem|option|field:(?:button|submit))\s+("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")(?=$| [→=] )/;

function matchesWording(label: string, patterns: readonly RegExp[]): boolean {
  const wording = label.replace(/[\u0591-\u05bd\u05bf-\u05c2\u05c4-\u05c5\u05c7\p{Bidi_Control}]/gu, "")
    .replace(/\s+/g, " ").trim();
  return patterns.some((pattern) => pattern.test(wording));
}

/** Classifies a masked read. The caller owns any click or handoff. */
export function accountChooser(page: MaskedPageRead, wantedAccount: string | undefined): AccountChooserDecision {
  const hasPrompt = [page.title, ...page.text.split("\n")].some((line) => matchesWording(line, CHOOSER_PROMPT));
  const wanted = wantedAccount?.trim().toLowerCase();
  const matchingRefs: string[] = [];
  let seen = 0;
  let hasManagement = false;

  for (const item of page.items) {
    const match = ACCOUNT_ITEM.exec(item);
    if (!match) continue;
    const [, ref, quotedLabel] = match;
    const label = (JSON.parse(quotedLabel!) as string).trim();
    if (!label) continue;
    if (matchesWording(label, ACCOUNT_MANAGEMENT)) {
      hasManagement = true;
      continue;
    }
    seen++;
    if (label.toLowerCase() === wanted) matchingRefs.push(ref!);
  }

  if (!hasPrompt && !(hasManagement && seen === 0)) return { kind: "none" };
  if (!wanted) return { kind: "hold", reason: "The job has no requested account.", seen };
  if (seen === 0) return { kind: "hold", reason: "The chooser lists no selectable accounts.", seen };
  if (matchingRefs.length === 0) return { kind: "hold", reason: "The requested account is missing from the chooser.", seen };
  if (matchingRefs.length > 1) return { kind: "hold", reason: "More than one entry matches the requested account.", seen };
  return { kind: "pick", ref: matchingRefs[0]! };
}
