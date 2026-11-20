export interface PasskeyPromptRead {
  readonly text?: string;
  readonly items?: readonly string[];
  readonly buttonLabels?: readonly string[];
  /** Visible text scoped to the active dialog. */
  readonly dialogText?: string;
  readonly webauthnPending?: boolean;
}

export type PasskeyPromptKind = "passkey" | "security-key" | "device-biometric";

const MUST_NOT = Object.freeze(["virtual-authenticator", "try-another-way", "retry"] as const);

export type PasskeyPromptResult =
  | { verdict: "none" }
  | {
    verdict: "hold";
    kind: PasskeyPromptKind;
    reason: string;
    /** Switching methods, including choosing a password, is Amit's decision. */
    mustNot: typeof MUST_NOT;
    passwordOptionOffered: boolean;
  };

const PROMPTS: ReadonlyArray<readonly [PasskeyPromptKind, RegExp]> = [
  ["passkey", /^(?:(?:use|sign in with|continue with) (?:a |your )?)?passkey$/],
  ["passkey", /^(?:מפתח גישה|(?:כניסה|התחברות) באמצעות מפתח גישה|השתמש(?:ו)? במפתח הגישה)$/u],
  ["security-key", /^(?:(?:insert|touch|use|sign in with) (?:a |your )?)?security key$/],
  ["security-key", /^(?:מפתח אבטחה|יש (?:להכניס את|לגעת ב)מפתח האבטחה|השתמש(?:ו)? במפתח האבטחה)$/u],
  ["device-biometric", /^(?:(?:use|sign in with) (?:your )?)?(?:fingerprint|face id|touch id|windows hello)$/],
  ["device-biometric", /^(?:טביעת אצבע|(?:כניסה|התחברות) באמצעות טביעת אצבע|השתמש(?:ו)? בטביעת האצבע)$/u],
];

const PASSWORD_OPTIONS = new Set([
  "use password instead", "use a password instead", "use your password instead", "sign in with a password",
  "שימוש בסיסמה במקום זאת", "השתמש בסיסמה במקום זאת", "כניסה באמצעות סיסמה", "כניסה עם סיסמה",
]);

const REASONS: Record<PasskeyPromptKind, string> = {
  passkey: "Amit, finish signing in with your passkey in the browser.",
  "security-key": "Amit, finish signing in with your security key in the browser.",
  "device-biometric": "Amit, finish signing in with your device's biometric prompt in the browser.",
};

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/•{4,}|\[secret hidden\]/g, " ")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?:…]+$/, "")
    .trimEnd();
}

function textLines(text = ""): string[] {
  return text.split("\n").map(normalize).filter(Boolean);
}

function promptKind(text: string): PasskeyPromptKind | undefined {
  const phrase = text.replace(/^(?:please |נא )/, "").replace(/ (?:to continue|to sign in|כדי להמשיך)$/, "");
  return PROMPTS.find(([, pattern]) => pattern.test(phrase))?.[0];
}

function itemButtonLabel(item: string): string {
  // Friday's numbered read items encode labels as JSON strings before any field value.
  const label = /^\[\d+\]\s+(?:button|field:button|field:submit)\s+("(?:[^"\\]|\\.)*")(?=$| = )/i.exec(item)?.[1];
  if (!label) return "";
  try {
    return JSON.parse(label) as string;
  } catch {
    return "";
  }
}

/** Classifies masked facts so the caller can hold the job for Amit. */
export function detectPasskeyPrompt(read?: PasskeyPromptRead | null): PasskeyPromptResult {
  const buttons = [...(read?.buttonLabels ?? []), ...(read?.items ?? []).map(itemButtonLabel)].map(normalize).filter(Boolean);
  const lines = textLines(read?.text);
  // In a flat read, a standalone prompt can be paired with a separately reported
  // button. In longer reads, look for the button label on a neighboring line.
  const nearbyText = buttons.length === 0 ? [] : lines.filter((_, index) =>
    lines.length === 1 || buttons.includes(lines[index - 1]) || buttons.includes(lines[index + 1]),
  );
  const candidates = [...textLines(read?.dialogText), ...nearbyText, ...buttons];
  const kind = candidates.map(promptKind).find(Boolean) ?? (read?.webauthnPending === true ? "passkey" : undefined);
  if (!kind) return { verdict: "none" };

  return {
    verdict: "hold",
    kind,
    reason: REASONS[kind],
    mustNot: MUST_NOT,
    passwordOptionOffered: buttons.some((label) => PASSWORD_OPTIONS.has(label)),
  };
}
