import assert from "node:assert/strict";
import { createDecipheriv, randomBytes } from "node:crypto";
import test from "node:test";
import { openProfile, sealProfile } from "../src/pomelo/browser/profile-seal.js";

const profileId = "profile-é-🌱";
const data = Buffer.from("synthetic browser profile archive fixture");
const versionOffset = 4;
const ivOffset = versionOffset + 1;
const tagOffset = ivOffset + 12;
const ciphertextOffset = tagOffset + 16;

function assertRedacted(message: string, key: Buffer): void {
  assert.equal(message.includes(key.toString("hex")), false);
  assert.equal(message.includes(key.toString("base64")), false);
  assert.equal(message.includes(data.toString("utf8")), false);
}

test("sealed profile bytes round-trip in the version 1 format", () => {
  const key = randomBytes(32);
  const sealed = Buffer.from(sealProfile({ profileId, key, data }));

  assert.equal(sealed.toString("ascii", 0, versionOffset), "PMLO");
  assert.equal(sealed[versionOffset], 1);
  assert.equal(sealed.length, ciphertextOffset + data.length);
  assert.equal(sealed.includes(data), false);

  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(ivOffset, tagOffset), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(profileId, "utf8"));
  decipher.setAuthTag(sealed.subarray(tagOffset, ciphertextOffset));
  assert.deepEqual(Buffer.concat([decipher.update(sealed.subarray(ciphertextOffset)), decipher.final()]), data);

  const result = openProfile({ profileId, key, sealed });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(Buffer.from(result.data), data);
});

test("an empty archive round-trips", () => {
  const key = randomBytes(32);
  const sealed = sealProfile({ profileId, key, data: new Uint8Array(0) });
  const result = openProfile({ profileId, key, sealed });
  assert.equal(sealed.length, ciphertextOffset);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.length, 0);
});

test("sealing the same archive twice uses a fresh IV", () => {
  const key = randomBytes(32);
  const first = sealProfile({ profileId, key, data });
  const second = sealProfile({ profileId, key, data });
  assert.notDeepEqual(first.subarray(ivOffset, tagOffset), second.subarray(ivOffset, tagOffset));
  assert.notDeepEqual(first, second);
});

test("a wrong key or a different profile ID fails authentication", () => {
  const key = randomBytes(32);
  const sealed = sealProfile({ profileId, key, data });
  const expected = { ok: false, reason: "wrong-key-or-tampered" };
  const wrongKey = randomBytes(32);
  const result = openProfile({ profileId, key: wrongKey, sealed });
  assert.deepEqual(result, expected);
  assertRedacted(JSON.stringify(result), key);
  assertRedacted(JSON.stringify(result), wrongKey);
  assert.deepEqual(openProfile({ profileId: "profile-other", key, sealed }), expected);
  assert.deepEqual(openProfile({ profileId: "", key, sealed }), expected);
});

test("malformed UTF-16 profile IDs cannot authenticate as the replacement character", () => {
  const key = randomBytes(32);
  const sealed = sealProfile({ profileId: "\uFFFD", key, data });
  assert.deepEqual(openProfile({ profileId: "\uD800", key, sealed }), {
    ok: false,
    reason: "wrong-key-or-tampered",
  });
  assert.throws(() => sealProfile({ profileId: "\uD800", key, data }), Error);
});

test("changes to the IV, tag or ciphertext fail authentication", () => {
  const key = randomBytes(32);
  const sealed = sealProfile({ profileId, key, data });
  for (const fieldOffset of [ivOffset, tagOffset, ciphertextOffset]) {
    const tampered = Uint8Array.from(sealed);
    tampered[fieldOffset] ^= 1;
    assert.deepEqual(openProfile({ profileId, key, sealed: tampered }), {
      ok: false,
      reason: "wrong-key-or-tampered",
    });
  }
});

test("a truncated header, bad magic or unsupported version returns a reason", () => {
  const key = randomBytes(32);
  const sealed = sealProfile({ profileId, key, data });
  const truncated = sealed.subarray(0, ciphertextOffset - 1);
  const badMagic = Uint8Array.from(sealed);
  badMagic[0] ^= 1;
  for (const invalid of [truncated, badMagic]) {
    const result = openProfile({ profileId, key, sealed: invalid });
    assert.deepEqual(result, { ok: false, reason: "bad-format" });
    assertRedacted(JSON.stringify(result), key);
  }

  const unsupported = Uint8Array.from(sealed);
  unsupported[versionOffset] = 2;
  const result = openProfile({ profileId, key, sealed: unsupported });
  assert.deepEqual(result, { ok: false, reason: "unsupported-version" });
  assertRedacted(JSON.stringify(result), key);
});

test("a short key or invalid sealing profile ID reports only a redacted error", () => {
  const key = randomBytes(32);
  const shortKey = randomBytes(32).subarray(0, 16);
  const sealed = sealProfile({ profileId, key, data });
  const result = openProfile({ profileId, key: shortKey, sealed });
  assert.deepEqual(result, { ok: false, reason: "bad-key-length" });
  assertRedacted(JSON.stringify(result), shortKey);

  for (const input of [{ profileId, key: shortKey, data }, { profileId: "", key, data }]) {
    assert.throws(() => sealProfile(input), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.constructor, Error);
      assertRedacted(error.message, input.key);
      return true;
    });
  }
});
