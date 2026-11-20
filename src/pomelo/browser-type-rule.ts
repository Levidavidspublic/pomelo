import { secretField } from "../browser-driver.js";
import { HIDDEN, hideSecrets } from "../secrets.js";

export interface MaskedTypeField {
  type?: unknown;
  autocomplete?: unknown;
  name?: unknown;
  label?: unknown;
  masked?: boolean;
  filledByBroker?: boolean;
}

export interface TypeDecision {
  action: "allow" | "refuse-use-broker" | "hold";
  code: string;
  message: string;
}

const BROKER_MESSAGE = "Use the 1Password broker tool to fill by reference.";
const SECRET_FIELD_PHRASE = /pass[\s_-]*(?:word|code)|סיסמ[הא]|(?:card|cc)[\s_-]*number|security[\s_-]*code|one[\s_-]*time[\s_-]*code/i;
const SECRET_FIELD_TOKEN = /(?:^|[^a-z0-9])(?:otp|cvv|cvc|pin)\d*(?![a-z0-9])/i;

function hasSecretFieldName(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Split camelCase and acronyms so a short hint such as PIN matches loginPIN but not shipping.
  const words = value.replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return SECRET_FIELD_PHRASE.test(words) || SECRET_FIELD_TOKEN.test(words);
}

/** Checks a planned browser type action and returns a status with fixed wording. */
export function decideType(field: MaskedTypeField | null | undefined, text: unknown): TypeDecision {
  if (!field || typeof field !== "object" || Array.isArray(field)) {
    return { action: "hold", code: "missing_field", message: "A field description is required." };
  }
  if (typeof text !== "string") {
    return { action: "hold", code: "invalid_text", message: "Typing requires a text string." };
  }

  const { type, autocomplete, name, label, masked, filledByBroker } = field;
  if (
    masked === true ||
    filledByBroker === true ||
    secretField({
      type: typeof type === "string" ? type.trim() : undefined,
      autocomplete: typeof autocomplete === "string" ? autocomplete : undefined,
      name: typeof name === "string" ? name.trim() : undefined,
    }) ||
    hasSecretFieldName(name) ||
    hasSecretFieldName(label)
  ) {
    return { action: "refuse-use-broker", code: "secret_field", message: BROKER_MESSAGE };
  }
  if (text.includes(HIDDEN) || hideSecrets(text).hidden > 0) {
    return { action: "refuse-use-broker", code: "secret_text", message: BROKER_MESSAGE };
  }
  return { action: "allow", code: "allowed", message: "Typing is allowed." };
}
