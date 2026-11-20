import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  PAIRING_LIFETIME_MS,
  checkPairing,
  hashPairingToken,
  markUsed,
} from "../src/pomelo/import-pairing.js";

const token = ["fixture", "import", "pairing"].join("-");
const wrongToken = `x${token.slice(1)}`;
const longerToken = `${token}-longer`;
const tokenHash = createHash("sha256").update(token).digest("hex");
const record = Object.freeze({ tokenHash, importRunId: "run-1", issuedAt: 1_000 });
const offered = Object.freeze({ token, importRunId: record.importRunId });
const now = 2_000;
const lifetime = 10 * 60_000;
const canaries = [token, wrongToken, longerToken, tokenHash, hashPairingToken(wrongToken), hashPairingToken(longerToken)];

function assertResult(result: unknown, expected: unknown): void {
  const serialized = JSON.stringify(result);
  for (const canary of canaries) {
    assert.equal(serialized.includes(canary), false);
  }
  assert.deepEqual(result, expected);
}

test("uses a SHA-256 digest and a ten-minute lifetime", () => {
  assert.ok(Buffer.from(hashPairingToken(token)).equals(Buffer.from(tokenHash)));
  assert.equal(PAIRING_LIFETIME_MS, lifetime);
});

test("accepts the right token for its run through the lifetime boundary", () => {
  assertResult(checkPairing(record, offered, now), { ok: true });
  assertResult(checkPairing(record, offered, record.issuedAt + lifetime), { ok: true });
});

test("refuses a missing pairing", () => {
  for (const missing of [undefined, null]) {
    assertResult(checkPairing(missing, offered, now), { ok: false, reason: "no-pairing" });
  }
});

test("refuses wrong tokens even when their length differs", () => {
  for (const wrong of [wrongToken, longerToken]) {
    assertResult(checkPairing(record, { ...offered, token: wrong }, now), { ok: false, reason: "wrong-token" });
  }
});

test("refuses malformed credentials without throwing or matching a hash prefix", () => {
  for (const malformedHash of [`${tokenHash}00`, `${tokenHash}zz`]) {
    assertResult(checkPairing({ ...record, tokenHash: malformedHash }, offered, now), { ok: false, reason: "wrong-token" });
  }

  // UTF-8 encoding would turn a lone surrogate into the same bytes as a replacement character.
  const replacementHash = hashPairingToken(`${token}\ufffd`);
  const malformedToken = `${token}\ud800`;
  assertResult(checkPairing({ ...record, tokenHash: replacementHash }, { ...offered, token: malformedToken }, now),
    { ok: false, reason: "wrong-token" });
  assert.throws(() => hashPairingToken(malformedToken), { name: "TypeError", message: "Invalid pairing token" });
});

test("refuses the right token for another run", () => {
  assertResult(checkPairing(record, { ...offered, importRunId: "run-2" }, now), { ok: false, reason: "wrong-run" });
});

test("expires one millisecond past the lifetime", () => {
  assertResult(checkPairing(record, offered, record.issuedAt + lifetime + 1), { ok: false, reason: "expired" });
});

test("refuses a used pairing, including a zero usedAt timestamp", () => {
  assertResult(checkPairing({ ...record, usedAt: 0 }, offered, now), { ok: false, reason: "used" });
});

test("prioritizes revocation over wrong credentials, use, expiry and clock skew", () => {
  const revoked = { ...record, revoked: true, usedAt: now };
  const wrongOffer = { token: wrongToken, importRunId: "run-2" };
  for (const time of [record.issuedAt - 1, record.issuedAt + lifetime + 1]) {
    assertResult(checkPairing(revoked, wrongOffer, time), { ok: false, reason: "revoked" });
  }
});

test("refuses a pairing issued in the future", () => {
  assertResult(checkPairing({ ...record, issuedAt: now + 1 }, offered, now), { ok: false, reason: "clock-skew" });
});

test("marks a copy used, preserves its fields, and refuses replay", () => {
  const used = markUsed(record, now);
  assert.notEqual(used, record);
  assert.ok(Buffer.from(used.tokenHash).equals(Buffer.from(tokenHash)));
  assert.equal(used.importRunId, record.importRunId);
  assert.equal(used.issuedAt, record.issuedAt);
  assert.equal(used.usedAt, now);
  assert.equal(Object.hasOwn(record, "usedAt"), false);
  assertResult(checkPairing(used, offered, now), { ok: false, reason: "used" });
});
