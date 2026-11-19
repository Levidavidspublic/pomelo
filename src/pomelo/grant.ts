import { newSecretRef, type SecretRef } from "./secret-ref.js";

export type Grant = Readonly<{
  id: string;
  refId: string;
  origin: string;
  frame: string;
  jobId: string;
  expiresAt: number;
  revoked: boolean;
}>;

type GrantInput = Omit<Grant, "refId" | "revoked">;

type FillContext = {
  origin: string;
  frame: string;
  now: number;
};

const grantInputFields = ["id", "origin", "frame", "jobId", "expiresAt"];

export function grantKey(id: string): string {
  return `pomelo:grant:${id}`;
}

export function newGrant(ref: SecretRef, input: GrantInput): Grant {
  if (Reflect.ownKeys(input).some((key) => typeof key !== "string" || !grantInputFields.includes(key))) {
    throw new TypeError("Grant has an unexpected field");
  }

  const { id: refId, allowedOrigins } = newSecretRef(ref);
  const { id, origin, frame, jobId, expiresAt } = input;
  if (typeof origin !== "string" || !allowedOrigins.includes(origin)) {
    throw new TypeError("Grant origin must be allowed by the secret ref");
  }
  if ([id, frame, jobId].some((value) => typeof value !== "string" || !value.trim())) {
    throw new TypeError("Grant requires an id, frame and job id");
  }
  if (!Number.isFinite(expiresAt)) {
    throw new TypeError("Grant expiresAt must be a finite timestamp");
  }

  return Object.freeze({ id, refId, origin, frame, jobId, expiresAt, revoked: false });
}

export function revokeGrant(grant: Grant): Grant {
  const { id, refId, origin, frame, jobId, expiresAt } = grant;
  return Object.freeze({ id, refId, origin, frame, jobId, expiresAt, revoked: true });
}

export function canFill(grant: Grant, ref: SecretRef, { origin, frame, now }: FillContext): boolean {
  return grant.revoked === false && grant.refId === ref.id &&
    grant.origin === origin && grant.frame === frame && ref.allowedOrigins.includes(origin) &&
    Number.isFinite(now) && Number.isFinite(grant.expiresAt) && now < grant.expiresAt &&
    (ref.expiresAt === undefined || (Number.isFinite(ref.expiresAt) && now < ref.expiresAt));
}
