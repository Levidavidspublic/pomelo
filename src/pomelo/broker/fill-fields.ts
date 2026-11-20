export type FillPart = "username" | "password" | "otp";

export interface MaskedFillField {
  id: string;
  /** Browser-reported control type, including search and textarea. */
  type?: unknown;
  autocomplete?: unknown;
  name?: unknown;
  label?: unknown;
  visible: boolean;
  editable: boolean;
  frame: string;
}

type FillPlacement = { part: FillPart; fieldId: string };
type HoldReason = "no_match" | "ambiguous_field";

export type FillFieldDecision =
  | { decision: "fill"; plan: FillPlacement[] }
  | { decision: "hold"; plan: FillPlacement[]; reason: HoldReason };

const usernameTypes = new Set(["text", "email", "tel"]);
const otpTypes = new Set(["text", "tel", "number", "password"]);
const searchHint = /(?:^| )(?:search|searchbox|חיפוש)(?: |$)/u;
const usernameHints = new Set([
  "username", "user name", "email", "e mail", "email address", "e mail address",
  "username or email", "email or username", "שם משתמש", "דואל", "כתובת דואל",
  "דואר אלקטרוני", "כתובת דואר אלקטרוני", "אימייל", "כתובת אימייל",
]);
const otpLabels = new Set([
  "code", "otp", "otp code", "one time code", "one time password", "verification code",
  "authentication code", "login code", "2fa code", "קוד", "קוד אימות", "קוד חד פעמי", "קוד כניסה",
]);

function hintWords(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/["'״׳]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function partForField(field: MaskedFillField): FillPart | undefined {
  const type = typeof field.type === "string" ? field.type.toLowerCase() : "";
  const name = hintWords(field.name);
  const label = hintWords(field.label);
  if (searchHint.test(name) || searchHint.test(label)) return;

  const tokens = typeof field.autocomplete === "string" ? field.autocomplete.trim().toLowerCase().split(/\s+/) : [];
  // The credential hint can have a section prefix and a trailing WebAuthn token.
  const autocomplete = tokens.at(-1) === "webauthn" ? tokens.at(-2) : tokens.at(-1);
  const hasNoFieldHint = !autocomplete || autocomplete === "on" || autocomplete === "off";

  if (autocomplete === "one-time-code" || otpLabels.has(label)) {
    // A generic code label can also appear on a field intended for something like a card code.
    if (otpTypes.has(type) && (hasNoFieldHint || autocomplete === "one-time-code")) return "otp";
    return;
  }

  if (type === "password") return "password";

  const hasUsernameHint = autocomplete === "username" || autocomplete === "email";
  const hasUsernameName = usernameHints.has(label) || usernameHints.has(name);
  if (usernameTypes.has(type) && (hasUsernameHint || ((hasNoFieldHint || autocomplete === "tel") && hasUsernameName))) {
    return "username";
  }
}

/** A hold can include unambiguous placements for review. Only a fill can be dispatched. */
export function planFill(
  fields: readonly MaskedFillField[],
  parts: readonly FillPart[],
  grantedFrame: string,
): FillFieldDecision {
  const frameFields = fields.filter((field) => field.frame === grantedFrame);
  const candidates = frameFields
    .filter((field) => field.visible === true && field.editable === true && field.id.trim() !== "")
    .map((field) => ({ field, part: partForField(field) }));

  const plan: FillPlacement[] = [];
  let reason: HoldReason | undefined;
  for (const part of new Set(parts)) {
    const matches = candidates.filter((candidate) => candidate.part === part);
    if (matches.length === 0) {
      reason ??= "no_match";
      continue;
    }

    const { field } = matches[0];
    if (matches.length > 1 || frameFields.some((other) => other !== field && other.id === field.id)) {
      reason ??= "ambiguous_field";
      continue;
    }
    plan.push({ part, fieldId: field.id });
  }

  if (reason || plan.length === 0) return { decision: "hold", plan, reason: reason ?? "no_match" };
  return { decision: "fill", plan };
}
