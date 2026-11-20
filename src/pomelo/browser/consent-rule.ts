export interface ConsentButton {
  readonly label: string;
  readonly role: string;
  readonly ref: number;
}

export interface ConsentBanner {
  readonly blocksPage: boolean;
  readonly buttons: readonly ConsentButton[];
}

export interface ConsentBannerRead {
  readonly banner?: ConsentBanner | null;
  /** The caller supplies Amit's saved choice for the current site. */
  readonly siteChoice?: "accept" | "ask";
}

const HOLD_REASONS = {
  "accept-only": "This banner only offers an option to accept cookies.",
  "needs-steps": "This banner needs another step to set cookie preferences.",
  unclear: "This banner has no single clear button for the intended cookie choice.",
  ask: "Amit chose to decide about cookies on this site.",
} as const;

type HoldCode = keyof typeof HOLD_REASONS;

export type ConsentDecision =
  | { action: "none" }
  | { action: "leave" }
  | { action: "press"; ref: number }
  | { action: "hold"; code: HoldCode; reason: string };

const REFUSAL_LABELS = new Set([
  "reject all", "reject", "decline", "decline all",
  "only necessary", "necessary cookies only", "use necessary cookies only",
  "דחה הכל", "דחה הכול", "רק הכרחיות", "עוגיות הכרחיות בלבד",
]);

const ACCEPT_LABELS = new Set([
  "accept", "accept all", "accept all cookies", "agree", "allow all",
  "אשר הכל", "אשר הכול", "קבל הכל", "קבל הכול",
]);

const MANAGE_LABELS = new Set([
  "manage options", "manage preferences", "manage cookies", "cookie settings",
  "ניהול העדפות", "הגדרות עוגיות",
]);

function hold(code: HoldCode): ConsentDecision {
  return { action: "hold", code, reason: HOLD_REASONS[code] };
}

/** Decide from masked banner facts using whole visible button labels. */
export function decideConsentBanner({ banner, siteChoice }: ConsentBannerRead): ConsentDecision {
  if (!banner) return { action: "none" };
  if (siteChoice === "ask") return hold("ask");
  if (!banner.blocksPage && !siteChoice) return { action: "leave" };

  const buttons = banner.buttons
    .filter(({ role, ref }) => role === "button" && Number.isSafeInteger(ref) && ref > 0)
    .map(({ label, ref }) => ({ label: label.trim().toLowerCase().replace(/\s+/g, " "), ref }));

  const allowedLabels = siteChoice === "accept" ? ACCEPT_LABELS : REFUSAL_LABELS;
  const [choice, otherChoice] = buttons.filter(({ label }) => allowedLabels.has(label));
  if (choice) {
    if (otherChoice || banner.buttons.filter(({ ref }) => ref === choice.ref).length !== 1) {
      return hold("unclear");
    }
    return { action: "press", ref: choice.ref };
  }

  if (buttons.length && buttons.every(({ label }) => ACCEPT_LABELS.has(label) || MANAGE_LABELS.has(label))) {
    return hold(buttons.some(({ label }) => MANAGE_LABELS.has(label)) ? "needs-steps" : "accept-only");
  }
  return hold("unclear");
}
