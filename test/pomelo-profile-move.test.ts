import assert from "node:assert/strict";
import test from "node:test";
import { checkProfileMove, isTailnetAddress } from "../src/pomelo/browser/profile-move.js";

const move = {
  fromLocation: "local",
  toLocation: "cloud",
  targetHost: "100.101.102.103",
  encryptedInTransit: true,
  encryptedAtRest: true,
  keyRef: "op://fictional-vault/sample-item/sample-field",
} as const;

test("an encrypted local-to-cloud move over tailnet returns only success status", () => {
  assert.deepEqual(checkProfileMove(move), { ok: true });
});

test("tailnet IPv4 includes both ends of 100.64.0.0/10", () => {
  assert.equal(isTailnetAddress("100.64.0.0"), true);
  assert.equal(isTailnetAddress("100.127.255.255"), true);
});

test("targets outside the tailnet ranges and targets that are not IP literals are refused", () => {
  for (const targetHost of [
    "100.63.0.1", "100.128.0.1", "8.8.8.8", "127.0.0.1", "192.168.1.5", "browser.example.test",
    "100.101.102.256", "100.101.102.103:443", "fd7a:115c:a1e1::1", "::ffff:192.168.1.5", "::6440:1",
    "::ffff:6440", "fd7a:115c:a1e0::1%eth0",
  ]) {
    assert.deepEqual(checkProfileMove({ ...move, targetHost }), { ok: false, reason: "not-tailnet" }, targetHost);
  }
});

test("tailnet IPv6 and IPv4-mapped IPv6 literals are accepted", () => {
  for (const targetHost of [
    "fd7a:115c:a1e0::1", "FD7A:115C:A1E0:0:0:0:0:1", "::ffff:100.101.102.103", "::ffff:6465:6667",
    "0:0:0:0:0:FFFF:6465:6667", "0::0:ffff:100.101.102.103",
  ]) {
    assert.deepEqual(checkProfileMove({ ...move, targetHost }), { ok: true }, targetHost);
  }
});

test("encryption in transit and at rest are both required", () => {
  assert.deepEqual(checkProfileMove({ ...move, encryptedInTransit: false }), {
    ok: false, reason: "not-encrypted-in-transit",
  });
  assert.deepEqual(checkProfileMove({ ...move, encryptedAtRest: false }), {
    ok: false, reason: "not-encrypted-at-rest",
  });
});

test("a missing or non-reference key is refused with no address or key in the result", () => {
  const { keyRef: _keyRef, ...withoutKeyRef } = move;
  const refusal = { ok: false, reason: "key-not-a-reference" };
  assert.deepEqual(checkProfileMove(withoutKeyRef), refusal);
  assert.deepEqual(checkProfileMove({ ...move, keyRef: "plain-text" }), refusal);
  assert.deepEqual(checkProfileMove({ ...move, keyRef: "op://" }), refusal);
});

test("only local-to-cloud moves are allowed", () => {
  const refusal = { ok: false, reason: "wrong-direction" };
  assert.deepEqual(checkProfileMove({ ...move, fromLocation: "cloud", toLocation: "local" }), refusal);
  assert.deepEqual(checkProfileMove({ ...move, toLocation: "local" }), refusal);
  assert.deepEqual(checkProfileMove({ ...move, fromLocation: "cloud" }), refusal);
});
