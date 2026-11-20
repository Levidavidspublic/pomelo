import type { SecretRef } from "../secret-ref.js";

export interface HttpAuthChallenge {
  /** The browser's serialized page origin. */
  origin: string;
  isHttps: boolean;
  isProxy: boolean;
  realm: string;
}

export interface HttpAuthAttempt {
  username?: string;
  password?: string;
}

export interface HttpAuthDecision {
  decision: "cancel" | "hold" | "refuse";
  reason: string;
  origin: string | null;
}

function parseOrigin(value: string): string | null {
  if (typeof value !== "string" || !/^https?:\/\//.test(value) || value.includes("*") || !URL.canParse(value)) {
    return null;
  }
  // Use the same serialized origin format as SecretRef.allowedOrigins.
  return new URL(value).origin === value ? value : null;
}

/** The realm is supplied by the server or proxy and stays out of the card. */
export function decideHttpAuth(
  challenge: HttpAuthChallenge,
  savedSites: readonly Pick<SecretRef, "allowedOrigins">[],
  attempt?: HttpAuthAttempt,
): HttpAuthDecision {
  const origin = parseOrigin(challenge.origin);
  if (attempt && ("username" in attempt || "password" in attempt)) {
    return { decision: "refuse", reason: "Use the 1Password broker to fill by reference.", origin };
  }
  if (origin === null) {
    return { decision: "refuse", reason: "The sign-in request has an invalid page origin.", origin };
  }
  if (challenge.isHttps !== true || !origin.startsWith("https://")) {
    return { decision: "refuse", reason: "Browser sign-in requires HTTPS.", origin };
  }
  if (challenge.isProxy) {
    return { decision: "hold", reason: "The proxy is asking for sign-in. Wait for Amit.", origin };
  }
  if (savedSites.some(({ allowedOrigins }) => allowedOrigins.includes(origin))) {
    return { decision: "hold", reason: `Browser sign-in on ${origin} needs Amit's review.`, origin };
  }
  return { decision: "cancel", reason: "There is no saved reference for this site.", origin };
}
