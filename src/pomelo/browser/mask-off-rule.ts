export type MaskOffActor = "amit" | "agent" | "skill" | "system";
export type MaskOffFieldKind = "text" | "password" | "card" | "otp" | "filled" | "none";
export type MaskOffVerdict = "masked" | "unmasked" | "refused";

export interface MaskOffAllowance {
  jobId: string;
  origin: string;
  grantedBy: MaskOffActor;
  expiresAt: number;
}

export interface MaskOffInput {
  requestedBy: MaskOffActor;
  jobId: string;
  origin: string;
  allowance?: MaskOffAllowance;
  now: number;
  fieldKind: MaskOffFieldKind;
}

export interface MaskOffResult {
  masked: boolean;
  verdict: MaskOffVerdict;
  reason: string;
}

function parseOrigin(value: unknown): string | null {
  // Require an HTTP(S) origin without credentials or page-specific components.
  if (typeof value !== "string" || !/^https?:\/\/[^/?#@\\\s\x00-\x1f\x7f]+\/?$/i.test(value)) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.hostname.includes("*") ? null : url.origin;
  } catch {
    return null;
  }
}

function isNonAmit(actor: unknown): boolean {
  return actor === "agent" || actor === "skill" || actor === "system";
}

function masked(reason: string, verdict: "masked" | "refused" = "masked"): MaskOffResult {
  return { masked: true, verdict, reason };
}

/** The caller supplies the authenticated requester, trusted allowance, and current time. */
export function maskOffDecision(input?: MaskOffInput | null): MaskOffResult {
  if (!input || typeof input !== "object") return masked("The mask-off request is missing or invalid.");
  const { requestedBy, jobId, origin, allowance, now, fieldKind } = input;

  if (isNonAmit(requestedBy)) return masked("Only Amit may request mask-off.", "refused");
  if (requestedBy !== "amit") return masked("The requester is missing or invalid.");
  if (isNonAmit(allowance?.grantedBy)) return masked("Only Amit may grant a mask-off allowance.", "refused");
  if (fieldKind !== "text" && fieldKind !== "none") return masked("This field must stay masked.");
  if (allowance?.grantedBy !== "amit") return masked("Amit's mask-off allowance is missing or invalid.");

  if (typeof jobId !== "string" || !jobId.trim() || jobId !== allowance.jobId) {
    return masked("The allowance does not match this browser job.");
  }
  const pageOrigin = parseOrigin(origin);
  if (pageOrigin === null || pageOrigin !== parseOrigin(allowance.origin)) {
    return masked("The allowance does not match this page origin.");
  }
  if (!Number.isFinite(now) || !Number.isFinite(allowance.expiresAt) || now >= allowance.expiresAt) {
    return masked("The allowance is expired or its timing is invalid.");
  }

  return { masked: false, verdict: "unmasked", reason: "Amit's allowance is active for this job and origin." };
}
