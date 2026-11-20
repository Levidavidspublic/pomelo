/** The browser's page read after masking. */
export interface LockoutPageRead {
  title: string;
  url: string;
  text: string;
  cut?: boolean;
  items: readonly string[];
}

// Reset covers both password reset and account unlock controls.
const FORBIDDEN_ACTIONS = Object.freeze(["fill", "reset", "answer"] as const);

export const LOCKOUT_WORDS = Object.freeze({
  account_locked: Object.freeze([
    /\b(?:account|profile)s? (?:\w+ ){0,4}(?:locked(?: out)?|blocked|disabled|suspended)\b/i,
    /\b(?:(?:locked|blocked|disabled|suspended) accounts?|locked out of (?:your |the )?account|(?:you are|you have been|you've been|you're) locked out|account lockout)\b/i,
    /(?:חשבו(?:ן|נות)(?: שלך| זה| המשתמש)?|חשבונך) (?:ננעל|נעול|נחסם|חסום|הושעה)/u,
    /(?:ננעל|נעול|נחסם|חסום) החשבון/u,
  ]),
  too_many_tries: Object.freeze([
    /\btoo many (?:(?:failed|incorrect|unsuccessful|sign[ -]?in|log[ -]?in|password) )*(?:attempts|tries)\b/i,
    /\b(?:maximum (?:number of )?(?:(?:sign[ -]?in|log[ -]?in|failed) )?attempts|(?:attempt|retry) limit) (?:has been )?(?:reached|exceeded)\b/i,
    /יותר מדי ני?סי?ונות|ני?סי?ונות(?: (?:כניסה|התחברות))? רבים מדי/u,
    /(?:חרגת|עברתם) מ(?:מגבלת|מספר) (?:ה)?ני?סי?ונות/u,
  ]),
  suspicious_sign_in: Object.freeze([
    /\b(?:suspicious|unusual|unrecognized|unrecognised) (?:account activity|activity|sign[ -]?in|log[ -]?in|login attempt)\b/i,
    /\b(?:sign[ -]?in|log[ -]?in)(?: attempt)? (?:looks?|seems?|was|is) (?:suspicious|unusual)\b/i,
    /פעילות (?:חריגה|חשודה|לא רגילה)|(?:כניסה|התחברות) (?:חריגה|חשודה|לא מזוהה)|ני?סיון (?:כניסה|התחברות) (?:חריג|חשוד)/u,
  ]),
  security_question: Object.freeze([
    /\bsecurity questions?\b/i,
    /\b(?:what|which|where)\b[^?!.]{0,80}\b(?:maiden name|first (?:pet|school|car)|(?:city|town) (?:were you|you were) born|were you born)\b/i,
    /שאל(?:ת|ות) ה?(?:אבטחה|ביטחון)|(?:מה|איפה|היכן) (?:היה )?(?:שם הנעורים|שם חיית המחמד|שם בית הספר הראשון|נולדת)/u,
  ]),
});
for (const words of Object.values(LOCKOUT_WORDS)) words.forEach(Object.freeze);

type HoldReason = keyof typeof LOCKOUT_WORDS | "bad_input";

export type LockoutStopResult =
  | { state: "go"; origin: string }
  | { state: "hold_for_amit"; reason: HoldReason; origin: string | null; forbiddenActions: typeof FORBIDDEN_ACTIONS };

// Friday serializes the control label as JSON, followed by an optional link or field value.
const ITEM_PREFIX = /^\[\d+\]\s+\S+\s+/;
const ITEM_LABEL = /^("(?:[^"\\]|\\.)*")(?=$| [→=] )/;
const LOCK_WORD = /\b(?:lock(?:ed|out)?|blocked|suspended)\b|ננעל|נעול|חסום|נחסם|הושעה/u;

function itemLabel(item: string): { label: string; malformed?: true } {
  const prefix = ITEM_PREFIX.exec(item);
  if (!prefix) return { label: item };
  const serialized = item.slice(prefix[0].length);
  const quoted = ITEM_LABEL.exec(serialized)?.[1];
  if (quoted !== undefined) {
    try {
      return { label: JSON.parse(quoted) };
    } catch {
      // A damaged label can still contain a visible warning.
    }
  }
  return { label: serialized.split(/ [→=] /, 1)[0], malformed: true };
}

function pageOrigin(address: unknown): string | null {
  if (typeof address !== "string" || !/^https?:\/\/[^/?#\\\s]/i.test(address)) return null;
  try {
    const url = new URL(address);
    return url.hostname.includes("*") ? null : url.origin;
  } catch {
    return null;
  }
}

function hold(reason: HoldReason, origin: string | null): LockoutStopResult {
  return { state: "hold_for_amit", reason, origin, forbiddenActions: FORBIDDEN_ACTIONS };
}

/** Classifies a masked snapshot for the caller's browser job. */
export function checkLockout(read: unknown): LockoutStopResult {
  let origin: string | null = null;
  try {
    if (!read || typeof read !== "object" || Array.isArray(read)) return hold("bad_input", origin);
    const { url, title, text, cut, items } = read as Record<keyof LockoutPageRead, unknown>;
    origin = pageOrigin(url);
    const visible = [title, text].filter((part): part is string => typeof part === "string");
    let malformed = origin === null || visible.length !== 2 || !Array.isArray(items) ||
      (cut !== undefined && typeof cut !== "boolean");

    for (const item of Array.isArray(items) ? items : []) {
      if (typeof item !== "string") {
        malformed = true;
        continue;
      }
      const parsed = itemLabel(item);
      visible.push(parsed.label);
      malformed ||= parsed.malformed === true;
    }

    // Normalize spaces from rendered text and ignore Hebrew vowel marks and direction markers.
    const wording = visible.map((part) => part
      .replace(/[\u0591-\u05bd\u05bf-\u05c2\u05c4-\u05c5\u05c7\p{Bidi_Control}]/gu, "")
      .replace(/\p{Pd}/gu, "-")
      .replace(/\s+/g, " ")
      .toLowerCase());

    for (const reason of Object.keys(LOCKOUT_WORDS) as (keyof typeof LOCKOUT_WORDS)[]) {
      if (wording.some((part) => LOCKOUT_WORDS[reason].some((pattern) => pattern.test(part)))) {
        return hold(reason, origin);
      }
    }
    if ((cut === true || malformed) && wording.some((part) => LOCK_WORD.test(part))) {
      return hold("account_locked", origin);
    }
    return malformed || origin === null ? hold("bad_input", origin) : { state: "go", origin };
  } catch {
    // A malformed read or label can throw with source text in the error.
    return hold("bad_input", origin);
  }
}
