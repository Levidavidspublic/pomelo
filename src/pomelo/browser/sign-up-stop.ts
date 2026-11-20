import { HIDDEN } from "../../secrets.js";
import { MASK } from "../mask.js";

export interface SignUpField {
  readonly label?: string;
  readonly type?: string;
  readonly value?: unknown;
}

export interface SignUpPageRead {
  readonly title?: string;
  readonly text: string;
  readonly buttons?: readonly (string | { readonly label: string })[];
  readonly fields?: readonly SignUpField[];
  /** Friday's numbered button, field and link labels. */
  readonly items?: readonly string[];
}

export type SignUpSignal = "unreadable-page" | "sign-up-wording" | "sign-up-button"
  | "confirm-password-field" | "social-sign-up" | "sign-in-form" | "newsletter-box";

export interface SignUpDecision {
  action: "go" | "hold";
  reason: string;
  signals: SignUpSignal[];
}

const ACCOUNT_CREATION = /^(?:please )?(?:(?:create|start) (?:(?:a|an|your) )?(?:(?:new|free) )*account\b|(?:יצירת חשבון|פתיחת חשבון|צור חשבון)(?!\p{L}))/u;
const SIGN_UP = /^(?:please )?(?:sign[- ]?up\b(?! for (?!free\b))|register\b|registration\b|join (?:for )?free\b|(?:הרשמה|הירשמות|הירשם|הירשמו)(?!\p{L}))/u;
const SIGN_IN = /^(?:(?:sign|log)[- ]?in\b|(?:התחברות|התחבר|היכנס|כניסה)(?!\p{L}))/u;
const SOCIAL_SIGN_UP = /^(?:sign[- ]?up|register) (?:with|using) (?:google|apple)\b/u;
const SOCIAL_CONTINUE = /^continue with (?:google|apple)\b/u;
const CONFIRM_PASSWORD = /\b(?:confirm|retype|repeat|re[- ]?enter)[ _-](?:your )?(?:new )?password\b|^password confirmation\b|(?:אימות|אישור) סיסמה|סיסמה בשנית/u;
const EMAIL = /^(?:e[- ]?mail(?: address)?|דוא["״']?ל|כתובת דוא["״']?ל)$/u;
const NEWSLETTER = /\b(?:sign[- ]?up|subscribe) (?:for|to) (?:(?:our|the|a) )?newsletter\b|\bnewsletter sign[- ]?up\b|(?:הרשמה|הירשמו) לניוזלטר/u;

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase()
    .replace(/\s+/g, " ").trim().replace(/[.!?:…]+$/, "").trimEnd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isList(value: unknown, valid: (item: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && [...value].every(valid));
}

function isPageRead(value: unknown): value is SignUpPageRead {
  return isRecord(value) && typeof value.text === "string" && isOptionalString(value.title)
    && isList(value.buttons, (button) => typeof button === "string" || (isRecord(button) && typeof button.label === "string"))
    && isList(value.fields, (field) => isRecord(field) && isOptionalString(field.label) && isOptionalString(field.type))
    && isList(value.items, (item) => typeof item === "string");
}

function numberedControls(items: readonly string[]): { kind: string; label: string }[] {
  return items.flatMap((item) => {
    // Friday separates the JSON label from a field value or a link destination.
    const match = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\]|\\.)*")(?=$| = | → )/i.exec(item);
    if (!match) return [];
    return [{ kind: match[1].toLowerCase(), label: normalize(JSON.parse(match[2]) as string) }];
  });
}

function isEmailField({ label, type }: { label: string; type: string }): boolean {
  return type === "email" || EMAIL.test(label);
}

function unreadablePage(): SignUpDecision {
  return { action: "hold", reason: "The page read is empty or unreadable. Amit needs to check the page.", signals: ["unreadable-page"] };
}

/** Classifies masked page facts for the browser job's handoff to Amit. */
export function signUpStop(pageRead?: unknown): SignUpDecision {
  try {
    if (!isPageRead(pageRead)) return unreadablePage();
    const { title = "", text, buttons = [], fields = [], items = [] } = pageRead;
    if (!normalize(text.replaceAll(MASK, " ").replaceAll(HIDDEN, " "))) return unreadablePage();

    const numbered = numberedControls(items);
    const buttonLabels = [
      ...buttons.map((button) => normalize(typeof button === "string" ? button : button.label)),
      ...numbered.filter(({ kind }) => /^(?:button|field:(?:submit|button|image))$/.test(kind)).map(({ label }) => label),
    ];
    const inputs = fields.map(({ label = "", type = "" }) => ({ label: normalize(label), type: normalize(type) }));
    const numberedInputs = numbered
      .filter(({ kind }) => kind.startsWith("field:") && !/^field:(?:submit|button|image|reset|hidden)$/.test(kind))
      .map(({ kind, label }) => ({ label, type: kind.slice("field:".length) }));
    const allInputs = [...inputs, ...numberedInputs];
    const linkLabels = new Set(numbered.filter(({ kind }) => kind === "link").map(({ label }) => label));
    const lines = text.split(/\r?\n/).map(normalize);
    const pageTitle = normalize(title);
    const pageCopy = [pageTitle, ...lines.filter((line) => !linkLabels.has(line))];

    const hasAccountWording = pageCopy.some((line) => ACCOUNT_CREATION.test(line));
    const hasSignUpWording = hasAccountWording || pageCopy.some((line) => SIGN_UP.test(line) || line === "join");
    const hasSignUpButton = buttonLabels.some((label) => ACCOUNT_CREATION.test(label)
      || (SIGN_UP.test(label) && !SOCIAL_SIGN_UP.test(label))
      || (hasSignUpWording && label === "join"));
    const hasCredentialField = allInputs.some((field) => field.type === "password" || isEmailField(field));
    const hasSocialContinue = buttonLabels.some((label) => SOCIAL_CONTINUE.test(label));
    const signInForm = (hasCredentialField && buttonLabels.some((label) => SIGN_IN.test(label)))
      || ((hasCredentialField || hasSocialContinue) && pageCopy.some((line) => SIGN_IN.test(line)));
    const socialSignUp = buttonLabels.some((label) => SOCIAL_SIGN_UP.test(label))
      || (hasSocialContinue && (hasAccountWording || (hasSignUpWording && !signInForm)));
    const confirmPassword = hasSignUpWording && allInputs.some(({ label }) => CONFIRM_PASSWORD.test(label));

    // Both lists can describe the same field.
    const newsletterBox = allInputs.every(isEmailField) && Math.max(inputs.length, numberedInputs.length) === 1
      && [pageTitle, ...lines, ...buttonLabels].some((line) => NEWSLETTER.test(line));
    if (newsletterBox && !hasAccountWording && !socialSignUp && !confirmPassword) {
      return { action: "go", reason: "The newsletter box belongs to the overlay rule.", signals: ["newsletter-box"] };
    }

    const signUpSubmit = hasSignUpButton && (hasSignUpWording || hasCredentialField);
    if (signUpSubmit || confirmPassword || socialSignUp) {
      const signals: SignUpSignal[] = [];
      if (hasSignUpWording) signals.push("sign-up-wording");
      if (signUpSubmit) signals.push("sign-up-button");
      if (confirmPassword) signals.push("confirm-password-field");
      if (socialSignUp) signals.push("social-sign-up");
      return { action: "hold", reason: "The page asks to create an account. Amit needs to decide how to proceed.", signals };
    }
    if (signInForm) {
      return { action: "go", reason: "The sign-in form belongs to the signed-out rule.", signals: ["sign-in-form"] };
    }
    return { action: "go", reason: "No account creation form was found.", signals: [] };
  } catch {
    // A malformed read can throw with page data in the error.
    return unreadablePage();
  }
}
