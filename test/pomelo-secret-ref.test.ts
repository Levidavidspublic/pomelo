import assert from "node:assert/strict";
import test from "node:test";
import { canFill, grantKey, newGrant, revokeGrant } from "../src/pomelo/grant.js";
import { newSecretRef, secretRefKey } from "../src/pomelo/secret-ref.js";

const refInput = {
  id: "ref-1",
  opRef: "op://fictional-vault/sample-item/sample-field",
  allowedOrigins: ["https://example.test", "https://example.test:8443"],
  field: "#sample-input",
};
const grantInput = {
  id: "grant-1",
  origin: "https://example.test",
  frame: "frame-1",
  jobId: "job-1",
  expiresAt: 2_000,
};
const fill = { origin: grantInput.origin, frame: grantInput.frame, now: 1_000 };

test("a secret ref holds the reference and its fill metadata", () => {
  const allowedOrigins = [...refInput.allowedOrigins];
  const ref = newSecretRef({ ...refInput, allowedOrigins });
  assert.deepEqual(ref, refInput);
  assert.equal(secretRefKey(ref.id), "pomelo:ref:ref-1");
  assert.equal(newSecretRef({ ...refInput, expiresAt: 3_000 }).expiresAt, 3_000);
  allowedOrigins.push("https://other.test");
  assert.deepEqual(ref.allowedOrigins, refInput.allowedOrigins);
});

test("a secret ref requires an op reference with a vault, item and field", () => {
  for (const opRef of [
    "plain-text",
    "",
    "https://example.test/item/field",
    "op://fictional vault/sample-item/sample-field",
    "op://fictional-vault/sample-item",
    "op://fictional-vault//sample-field",
    "op://fictional-vault/sample-item/sample-field?value=placeholder",
  ]) {
    assert.throws(() => newSecretRef({ ...refInput, opRef }), /op:\/\//);
  }
});

test("secret ref and grant builders reject fields outside their input schema", () => {
  const ref = newSecretRef(refInput);
  for (const extra of [{ value: "placeholder" }, { password: "placeholder" }]) {
    const refWithExtra = { ...refInput, ...extra };
    const grantWithExtra = { ...grantInput, ...extra };
    assert.throws(() => newSecretRef(refWithExtra), /unexpected field/i);
    assert.throws(() => newGrant(ref, grantWithExtra), /unexpected field/i);
  }
});

test("a secret ref requires a non-empty list of full HTTPS origins", () => {
  assert.throws(() => newSecretRef({ ...refInput, allowedOrigins: [] }), /allowedOrigins/);
  for (const origin of [
    "example.test",
    "http://example.test",
    "https://example.test/",
    "https://example.test/path",
    "https://example.test?query",
    "https://example.test#fragment",
    "https://*.example.test",
    "https://@example.test",
  ]) {
    assert.throws(() => newSecretRef({ ...refInput, allowedOrigins: [refInput.allowedOrigins[0], origin] }), /allowedOrigins/);
  }
});

test("a new grant binds the ref to an allowed origin, frame and job", () => {
  const ref = newSecretRef(refInput);
  const grant = newGrant(ref, grantInput);
  assert.deepEqual(grant, { ...grantInput, refId: ref.id, revoked: false });
  assert.equal(grantKey(grant.id), "pomelo:grant:grant-1");
  assert.throws(() => newGrant({ ...ref, opRef: "plain-text" }, grantInput), /op:\/\//);
  assert.throws(() => newGrant(ref, { ...grantInput, origin: "https://other.test" }), /origin/i);
  const portGrant = newGrant(ref, { ...grantInput, origin: "https://example.test:8443" });
  assert.equal(canFill(portGrant, ref, { ...fill, origin: portGrant.origin }), true);
});

test("revoking a grant preserves its fields in a new record", () => {
  const ref = newSecretRef(refInput);
  const grant = newGrant(ref, grantInput);
  const revoked = revokeGrant(grant);
  assert.notEqual(revoked, grant);
  assert.deepEqual(revoked, { ...grant, revoked: true });
  assert.equal(grant.revoked, false);
  assert.equal(canFill(revoked, ref, fill), false);
});

test("a fill requires the exact origin, frame and ref authorized by the grant", () => {
  const ref = newSecretRef(refInput);
  const grant = newGrant(ref, grantInput);
  assert.equal(canFill(grant, ref, fill), true);
  for (const origin of ["http://example.test", "https://example.test:8443", "https://sub.example.test"]) {
    assert.equal(canFill(grant, ref, { ...fill, origin }), false);
  }
  assert.equal(canFill(grant, ref, { ...fill, frame: "frame-2" }), false);
  assert.equal(canFill(grant, newSecretRef({ ...refInput, id: "ref-2" }), fill), false);
  const updatedRef = newSecretRef({ ...refInput, allowedOrigins: ["https://other.test"] });
  assert.equal(canFill(grant, updatedRef, fill), false);
});

test("a fill is denied at and after the grant or reference expiry", () => {
  const ref = newSecretRef({ ...refInput, expiresAt: 1_500 });
  const grant = newGrant(ref, grantInput);
  assert.equal(canFill(grant, ref, { ...fill, now: 1_499 }), true);
  assert.equal(canFill(grant, ref, { ...fill, now: 1_500 }), false);
  assert.equal(canFill(grant, ref, { ...fill, now: 1_501 }), false);

  const refWithoutExpiry = newSecretRef(refInput);
  assert.equal(canFill(grant, refWithoutExpiry, { ...fill, now: 1_999 }), true);
  assert.equal(canFill(grant, refWithoutExpiry, { ...fill, now: 2_000 }), false);
  assert.equal(canFill(grant, refWithoutExpiry, { ...fill, now: 2_001 }), false);
  assert.equal(canFill(grant, refWithoutExpiry, { ...fill, now: NaN }), false);
});

test("record builders reject non-finite expiry timestamps", () => {
  const ref = newSecretRef(refInput);
  for (const expiresAt of [NaN, Infinity, -Infinity]) {
    assert.throws(() => newSecretRef({ ...refInput, expiresAt }), /expiresAt/);
    assert.throws(() => newGrant(ref, { ...grantInput, expiresAt }), /expiresAt/);
  }
});
