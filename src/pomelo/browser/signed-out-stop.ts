import { MASK } from "../mask.js";

export interface SignedOutField {
  type?: unknown;
  name?: unknown;
  label?: unknown;
  autocomplete?: unknown;
  value?: unknown;
}

/** The masked snapshot shape used by the browser stop rules. */
export interface SignedOutPageRead {
  title: string;
  url: string;
  text: string;
  cut?: boolean;
  items: readonly string[];
  fields?: readonly SignedOutField[];
}

export interface SignedOutContext {
  jobOrigins: readonly string[];
  previousStepSignedIn: boolean;
  /** Number of eligible saved references for the read's exact origin, computed by the job. */
  matchingReferenceCount: number;
}

type SignInSignal = "sign_in_form" | "session_ended" | "sign_in_path";

export type SignedOutStopResult =
  | { state: "go"; reason: "no_sign_in" }
  | { state: "hold_for_amit"; reason: "bad_input" | "account_form" }
  | { state: "hold_for_broker" | "hold_for_amit"; reason: SignInSignal };

export const SIGNED_OUT_WORDS = Object.freeze({
  signIn: Object.freeze([
    /\b(?:sign|log)(?:-|\s+)?in\b/i,
    /התחברות|התחבר|היכנס|כניסה/u,
  ]),
  sessionEnded: Object.freeze([
    /\b(?:session\s+(?:has\s+)?expired|(?:signed|logged)(?:-|\s+)out)\b/i,
    /פג תוקף (?:החיבור|ההתחברות|ההפעלה|הסשן)|תוקף (?:החיבור|ההתחברות|ההפעלה|הסשן) פג|יצאת מהחשבון|נותקת מהחשבון/u,
  ]),
  accountForm: Object.freeze([
    /^(?:sign[- ]?up|register|registration|create (?:an? |your )?account|(?:change|reset|update) (?:your |the )?password|(?:set|choose) (?:a )?new password)\b/i,
    /^(?:הרשמה|הירשמות|הירשם|הירשמו|יצירת חשבון|פתיחת חשבון|(?:שינוי|החלפת|איפוס|עדכון) סיסמה)/u,
  ]),
});
for (const patterns of Object.values(SIGNED_OUT_WORDS)) {
  patterns.forEach(Object.freeze);
}

const badInput = Object.freeze({ state: "hold_for_amit", reason: "bad_input" } as const);
const signInPath = /(?:^|\/)(?:log-?in|sign-?in)(?:\/|$)/i;
const accountFormPath = /(?:^|\/)(?:sign-?up|register|(?:change|reset)-password)(?:\/|$)/i;
// The desktop reader writes a JSON label, then an optional link target or input value.
const pageItem = /^\[\d+\]\s+(button|field:submit|field:password|link)\s+("(?:[^"\\]|\\.)*")(?=$| [→=] )/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function httpUrl(address: unknown): URL | undefined {
  if (typeof address !== "string" || !/^https?:\/\//i.test(address)) return undefined;
  const url = new URL(address);
  if (!url.hostname.includes("*") && !url.username && !url.password) return url;
}

function inJobScope(jobOrigins: readonly unknown[], pageOrigin: string): boolean | undefined {
  let inScope = false;
  for (const address of jobOrigins) {
    if (typeof address !== "string" || !/^https?:\/\/[^/?#\\@\s]+\/?$/i.test(address)) return undefined;
    const site = httpUrl(address);
    if (!site) return undefined;
    if (site.origin === pageOrigin) inScope = true;
  }
  return inScope;
}

/** Classifies an already-masked read. The caller owns the waiting state and any broker request. */
export function signedOutStop(read: unknown, context: unknown): SignedOutStopResult {
  try {
    if (!isRecord(read) || !isRecord(context)) return badInput;
    const { title, text, cut, items, fields } = read;
    const { jobOrigins, previousStepSignedIn, matchingReferenceCount } = context;
    const url = httpUrl(read.url);
    if (!url || typeof title !== "string" || typeof text !== "string" || !Array.isArray(items) ||
        (cut !== undefined && typeof cut !== "boolean") ||
        (fields !== undefined && !Array.isArray(fields)) || !Array.isArray(jobOrigins) ||
        typeof previousStepSignedIn !== "boolean" || typeof matchingReferenceCount !== "number" ||
        !Number.isSafeInteger(matchingReferenceCount) || matchingReferenceCount < 0) {
      return badInput;
    }
    const inScope = inJobScope(jobOrigins, url.origin);
    if (inScope === undefined) return badInput;

    let passwordFields = 0;
    let hasNewPassword = false;
    for (const field of fields ?? []) {
      if (!isRecord(field)) return badInput;
      const autocomplete = typeof field.autocomplete === "string" ? field.autocomplete : "";
      const isNew = /(?:^|\s)new-password(?=\s|$)/i.test(autocomplete);
      const isCurrent = /(?:^|\s)current-password(?=\s|$)/i.test(autocomplete);
      const passwordType = typeof field.type === "string" && /^password$/i.test(field.type);
      const passwordName = typeof field.name === "string" && /^(?:password|passwd)$/i.test(field.name);
      if (!isNew && !isCurrent && !passwordType && !passwordName) continue;
      if (field.value !== MASK) return badInput;
      passwordFields++;
      hasNewPassword ||= isNew;
    }

    const formLabels = [title.trim()];
    const links = new Set<string>();
    let passwordItems = 0;
    for (const item of items) {
      if (typeof item !== "string") return badInput;
      const match = pageItem.exec(item);
      if (!match) continue;
      const kind = match[1]!.toLowerCase();
      if (kind === "field:password") {
        passwordItems++;
        continue;
      }
      const label = (JSON.parse(match[2]!) as string).trim();
      if (kind === "link") {
        links.add(label);
      } else {
        formLabels.push(label);
      }
    }

    // The items and fields lists may describe the same inputs.
    const passwordCount = Math.max(passwordItems, passwordFields);
    const hasPassword = passwordCount > 0;
    const { accountForm, sessionEnded, signIn } = SIGNED_OUT_WORDS;
    // A sign-up link next to a sign-in form does not make it a sign-up form.
    const isAccountPrompt = (label: string) => accountForm.some((pattern) => pattern.test(label));
    if (hasPassword && (passwordCount > 1 || hasNewPassword || accountFormPath.test(url.pathname) ||
        formLabels.some(isAccountPrompt) ||
        text.split("\n").map((line) => line.trim()).some((line) => !links.has(line) && isAccountPrompt(line)))) {
      return { state: "hold_for_amit", reason: "account_form" };
    }

    let reason: SignInSignal;
    if (sessionEnded.some((pattern) => pattern.test(text) || pattern.test(title))) {
      reason = "session_ended";
    } else if (hasPassword && signIn.some((pattern) => pattern.test(text) || formLabels.some((label) => pattern.test(label)))) {
      reason = "sign_in_form";
    } else if (previousStepSignedIn && signInPath.test(url.pathname)) {
      reason = "sign_in_path";
    } else if (!title.trim() && !text.trim() && items.length === 0 && !fields?.length) {
      return badInput;
    } else {
      return { state: "go", reason: "no_sign_in" };
    }
    return { state: inScope && matchingReferenceCount === 1 ? "hold_for_broker" : "hold_for_amit", reason };
  } catch {
    // Parsing and malformed getters can throw with input data in the error.
    return badInput;
  }
}
