import { HIDDEN } from "../../secrets.js";
import { MASK } from "../mask.js";

export interface NewPasswordStopResult {
  action: "go" | "hold";
  reason: string;
  signals: string[];
}

const NEW_PASSWORD_WORDING = [
  /\b(?:choose|change|confirm|create|enter|set|type)\s+(?:(?:a|the|your)\s+)?new\s+password\b/i,
  /\b(?:change|create)\s+(?:(?:a|the|your)\s+)?password\b/i,
  /\bpassword\s+(?:(?:has|is)\s+)?expired\b/i,
  /^new\s+password[.!:]?$/i,
  /(?:^|[^\p{L}])סיסמה\s+חדשה(?!\p{L})/u,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function visibleParts(text = ""): string[] {
  return text.replaceAll(HIDDEN, MASK).split(MASK).map((part) => part.trim()).filter(Boolean);
}

function unreadablePage(): NewPasswordStopResult {
  return { action: "hold", reason: "The page read is empty or invalid. Amit needs to check the page.", signals: ["unreadable-page"] };
}

/** Classifies a masked page read so the caller can hold the browser job for Amit. */
export function newPasswordStop(pageRead: unknown): NewPasswordStopResult {
  try {
    if (!isRecord(pageRead)) return unreadablePage();
    const { title, text, fields, elements } = pageRead;
    const controls = fields === undefined ? elements : fields;
    if (!isOptionalString(title) || !isOptionalString(text) || (controls !== undefined && !Array.isArray(controls))) {
      return unreadablePage();
    }

    const labels: string[] = [];
    const passwordCounts = new Map<string | undefined, number>();
    let hasNewPassword = false;
    let hasFieldMetadata = false;
    for (const field of controls ?? []) {
      if (!isRecord(field)) return unreadablePage();
      const { type, autocomplete, label, formId } = field;
      if (!isOptionalString(type) || !isOptionalString(autocomplete) || !isOptionalString(label) || !isOptionalString(formId)) {
        return unreadablePage();
      }

      hasNewPassword ||= /(?:^|\s)new-password(?=\s|$)/i.test(autocomplete ?? "");
      hasFieldMetadata ||= visibleParts(type).length > 0 || visibleParts(autocomplete).length > 0;
      if (type?.trim().toLowerCase() === "password") {
        // A flat read without form IDs describes a single group of fields.
        passwordCounts.set(formId, (passwordCounts.get(formId) ?? 0) + 1);
      }
      if (label !== undefined) labels.push(label);
    }

    const signals: string[] = [];
    if (hasNewPassword) signals.push("new-password-autocomplete");
    if ([...passwordCounts.values()].some((count) => count >= 2)) signals.push("multiple-password-fields");
    if (signals.length === 0) {
      const wording = [title, text, ...labels].flatMap(visibleParts);
      if (wording.length === 0 && !hasFieldMetadata) return unreadablePage();
      if (wording.some((part) => NEW_PASSWORD_WORDING.some((pattern) => pattern.test(part)))) {
        signals.push("new-password-wording");
      }
    }

    if (signals.length > 0) {
      return { action: "hold", reason: "The page asks for a new password. Amit decides how to proceed.", signals };
    }
    return { action: "go", reason: "No new password prompt detected.", signals };
  } catch {
    // A malformed read can throw errors containing page data.
    return unreadablePage();
  }
}
