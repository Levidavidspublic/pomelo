import { createHash, timingSafeEqual } from "node:crypto";

export const PAIRING_LIFETIME_MS = 10 * 60_000;

export interface PairingRecord {
  /** SHA-256 of the token as a hex string. */
  tokenHash: string;
  importRunId: string;
  /** Unix time in milliseconds. */
  issuedAt: number;
  usedAt?: number;
  revoked?: boolean;
}

export interface PairingOffer {
  token: string;
  importRunId: string;
}

type PairingRefusal = "no-pairing" | "wrong-token" | "wrong-run" | "expired" | "used" | "revoked" | "clock-skew";
export type PairingCheck = { ok: true } | { ok: false; reason: PairingRefusal };

function pairingDigest(token: unknown): Buffer | undefined {
  // UTF-8 replaces lone surrogates, which would let distinct strings hash to the same value.
  if (typeof token !== "string" || /[\uD800-\uDFFF]/u.test(token)) return;
  return createHash("sha256").update(token).digest();
}

/** Prepare the digest for the caller's pairing record. */
export function hashPairingToken(token: string): string {
  const digest = pairingDigest(token);
  if (!digest) throw new TypeError("Invalid pairing token");
  return digest.toString("hex");
}

/** Check an offer at the caller's time and return only its status. */
export function checkPairing(
  record: PairingRecord | null | undefined,
  offered: PairingOffer,
  now: number,
): PairingCheck {
  if (!record) return { ok: false, reason: "no-pairing" };
  if (record.revoked) return { ok: false, reason: "revoked" };

  const { tokenHash } = record;
  if (typeof tokenHash !== "string" || !/^[0-9a-f]{64}$/i.test(tokenHash)) {
    return { ok: false, reason: "wrong-token" };
  }
  const offeredHash = pairingDigest(offered?.token);
  if (!offeredHash || !timingSafeEqual(offeredHash, Buffer.from(tokenHash, "hex"))) {
    return { ok: false, reason: "wrong-token" };
  }

  if (record.importRunId !== offered.importRunId) return { ok: false, reason: "wrong-run" };
  if (record.usedAt !== undefined) return { ok: false, reason: "used" };
  if (!Number.isFinite(record.issuedAt) || !Number.isFinite(now) || record.issuedAt > now) {
    return { ok: false, reason: "clock-skew" };
  }
  if (now - record.issuedAt > PAIRING_LIFETIME_MS) return { ok: false, reason: "expired" };
  return { ok: true };
}

/** Return the consumed record for the caller to keep. */
export function markUsed(record: PairingRecord, now: number): PairingRecord {
  return { ...record, usedAt: now };
}
