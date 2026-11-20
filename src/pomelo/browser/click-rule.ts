import { HIDDEN } from "../../secrets.js";
import { MASK } from "../mask.js";

type RiskyAction = "pay" | "buy" | "delete" | "send" | "confirm";
type ActionKind = RiskyAction | "sign_in" | "other";

interface ClickRuleInput {
  action?: "click" | "submit";
  role?: string;
  /** The label from the browser mask layer. */
  label?: string;
  inputType?: string;
  formMethod?: string;
  /** Whether the associated form contains a secret filled by the broker. */
  formHasFilledSecret?: boolean;
  origin?: string;
  /** Origin of the grant used for that fill. */
  fillGrantOrigin?: string;
  allowedActions?: readonly { origin: string; action: RiskyAction }[];
}

interface ClickDecision {
  action: "go" | "hold" | "refuse";
  kind: ActionKind;
  reason: string;
}

const riskyWords: ReadonlyMap<string, RiskyAction> = new Map([
  ["pay", "pay"], ["שלם", "pay"], ["לשלם", "pay"], ["תשלום", "pay"], ["לתשלום", "pay"],
  ["buy", "buy"], ["order", "buy"], ["subscribe", "buy"],
  ["קנה", "buy"], ["לקנות", "buy"], ["רכוש", "buy"], ["לרכוש", "buy"],
  ["הזמן", "buy"], ["להזמין", "buy"], ["הירשם", "buy"], ["הירשמו", "buy"],
  ["delete", "delete"], ["remove", "delete"], ["מחק", "delete"], ["למחוק", "delete"], ["הסר", "delete"], ["להסיר", "delete"],
  ["send", "send"], ["transfer", "send"], ["שלח", "send"], ["לשלוח", "send"],
  ["העבר", "send"], ["להעביר", "send"], ["העברה", "send"],
  ["confirm", "confirm"], ["אשר", "confirm"], ["לאשר", "confirm"], ["אישור", "confirm"],
]);

function readOrigin(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  try {
    const { hostname, origin } = new URL(value);
    return hostname && origin !== "null" ? origin : null;
  } catch {
    return null;
  }
}

function submitsForm(input: ClickRuleInput): boolean {
  const role = input.role?.trim().toLowerCase();
  const type = input.inputType?.trim().toLowerCase();
  if (input.action === "submit" || role === "form" || type === "submit" || type === "image") return true;

  // A button associated with a form submits by default when no type is given.
  if (role === "button" && !type) return input.formHasFilledSecret === true || !!input.formMethod;
  return !role && !type && !!input.formMethod;
}

/** Checks masked browser metadata using the job's approvals and returns fixed wording. */
export function clickRule(input: ClickRuleInput): ClickDecision {
  const origin = readOrigin(input.origin);
  if (origin === null) {
    return { action: "refuse", kind: "other", reason: "A valid page origin is required." };
  }

  const label = input.label ?? "";
  // Strip vowel marks so pointed Hebrew and unpointed Hebrew match the same words.
  const words = label.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}\p{Pc}]+/gu) ?? [];
  const kinds = words.map((word) => riskyWords.get(word));
  const riskyKind = kinds.find((kind) => kind !== undefined);
  const secretSubmit = input.formHasFilledSecret === true && submitsForm(input);
  const kind = riskyKind ?? (secretSubmit ? "sign_in" : "other");

  if (secretSubmit && (!/\p{L}/u.test(label) || label.includes(MASK) || label.includes(HIDDEN))) {
    return { action: "hold", kind, reason: "A clear submit label is required after filling a secret field." };
  }

  const unapprovedKind = kinds.find((kind) => kind !== undefined && !input.allowedActions?.some(
    (entry) => entry.action === kind && readOrigin(entry.origin) === origin,
  ));
  if (unapprovedKind) {
    return { action: "hold", kind: unapprovedKind, reason: "Amit's approval is required for this action on this site." };
  }

  if (secretSubmit) {
    if (readOrigin(input.fillGrantOrigin) !== origin) {
      return { action: "hold", kind, reason: "The secret fill needs a grant for this site's origin." };
    }
    return { action: "go", kind, reason: "The submit may proceed using the grant for this site's origin." };
  }

  return {
    action: "go",
    kind,
    reason: riskyKind ? "Amit approved this action on this site." : "The label has no risky action words.",
  };
}
