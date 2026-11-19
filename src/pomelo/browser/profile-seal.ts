import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { isUint8Array } from "node:util/types";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const MAGIC = Buffer.from("PMLO", "ascii");
const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const VERSION_OFFSET = MAGIC.length;
const IV_OFFSET = VERSION_OFFSET + 1;
const TAG_OFFSET = IV_OFFSET + IV_LENGTH;
const CIPHERTEXT_OFFSET = TAG_OFFSET + TAG_LENGTH;

type OpenResult =
  | { ok: true; data: Uint8Array }
  | { ok: false; reason: "bad-key-length" | "bad-format" | "unsupported-version" | "wrong-key-or-tampered" };

function isProfileId(profileId: string): boolean {
  // UTF-8 would otherwise encode lone surrogates as the replacement character.
  return typeof profileId === "string" && profileId.length > 0 && !/[\uD800-\uDFFF]/u.test(profileId);
}

function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export function sealProfile(input: { profileId: string; key: Uint8Array; data: Uint8Array }): Uint8Array {
  const { profileId, key, data } = input;
  if (!isUint8Array(key) || key.byteLength !== KEY_LENGTH) throw new Error("Profile key must be 32 bytes");
  if (!isProfileId(profileId)) throw new Error("Profile ID must be nonempty and contain valid Unicode");

  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(Buffer.from(profileId, "utf8"));
    const ciphertext = cipher.update(data);
    const final = cipher.final();
    return joinBytes([MAGIC, Uint8Array.of(VERSION), iv, cipher.getAuthTag(), ciphertext, final]);
  } catch {
    throw new Error("Could not seal the profile archive");
  }
}

export function openProfile(input: { profileId: string; key: Uint8Array; sealed: Uint8Array }): OpenResult {
  try {
    const { key, profileId, sealed } = input;
    if (!isUint8Array(key) || key.byteLength !== KEY_LENGTH) return { ok: false, reason: "bad-key-length" };
    if (
      !isUint8Array(sealed) ||
      sealed.length < CIPHERTEXT_OFFSET ||
      !MAGIC.every((byte, index) => sealed[index] === byte)
    ) {
      return { ok: false, reason: "bad-format" };
    }
    if (sealed[VERSION_OFFSET] !== VERSION) return { ok: false, reason: "unsupported-version" };
    if (!isProfileId(profileId)) return { ok: false, reason: "wrong-key-or-tampered" };

    const iv = sealed.subarray(IV_OFFSET, TAG_OFFSET);
    const tag = sealed.subarray(TAG_OFFSET, CIPHERTEXT_OFFSET);
    const ciphertext = sealed.subarray(CIPHERTEXT_OFFSET);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAAD(Buffer.from(profileId, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = decipher.update(ciphertext);
    const final = decipher.final();
    return { ok: true, data: joinBytes([plaintext, final]) };
  } catch {
    return { ok: false, reason: "wrong-key-or-tampered" };
  }
}
