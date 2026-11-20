import assert from "node:assert/strict";
import test from "node:test";
import { maskOffDecision, type MaskOffInput } from "../src/pomelo/browser/mask-off-rule.js";

const origin = "https://example.test";
const now = 10_000;
const input = {
  requestedBy: "amit",
  jobId: "job-1",
  origin,
  allowance: { jobId: "job-1", origin, grantedBy: "amit", expiresAt: now + 1_000 },
  now,
  fieldKind: "text",
} satisfies MaskOffInput;

test("keeps masking on by default and permits Amit's active allowance", () => {
  const withoutAllowance = maskOffDecision({ ...input, allowance: undefined });
  assert.equal(withoutAllowance.verdict, "masked");
  assert.equal(withoutAllowance.masked, true);
  for (const fieldKind of ["text", "none"] as const) {
    const result = maskOffDecision({ ...input, fieldKind });
    assert.equal(result.verdict, "unmasked");
    assert.equal(result.masked, false);
  }
});

test("binds the allowance to the exact job and origin", () => {
  const wrongJob = maskOffDecision({ ...input, jobId: "job-2" });
  assert.equal(wrongJob.verdict, "masked");
  assert.equal(wrongJob.masked, true);

  for (const otherOrigin of [
    "https://example.test.invalid",
    "https://child.example.test",
    "https://example.test:8443",
    "http://example.test",
  ]) {
    const result = maskOffDecision({ ...input, origin: otherOrigin });
    assert.equal(result.verdict, "masked", otherOrigin);
    assert.equal(result.masked, true);
  }

  const sameOrigin = maskOffDecision({ ...input, origin: "https://EXAMPLE.test:443" });
  assert.equal(sameOrigin.verdict, "unmasked");
  assert.equal(sameOrigin.masked, false);
});

test("keeps masking on at and after expiry", () => {
  for (const time of [input.allowance.expiresAt, input.allowance.expiresAt + 1]) {
    const result = maskOffDecision({ ...input, now: time });
    assert.equal(result.verdict, "masked");
    assert.equal(result.masked, true);
  }
});

test("refuses requests and allowances from actors other than Amit", () => {
  for (const actor of ["agent", "skill", "system"] as const) {
    const request = maskOffDecision({ ...input, requestedBy: actor });
    assert.equal(request.verdict, "refused", actor);
    assert.equal(request.masked, true);

    const grant = maskOffDecision({ ...input, allowance: { ...input.allowance, grantedBy: actor } });
    assert.equal(grant.verdict, "refused", actor);
    assert.equal(grant.masked, true);
  }
});

test("keeps protected fields masked even with Amit's active allowance", () => {
  for (const fieldKind of ["password", "card", "otp", "filled"] as const) {
    const result = maskOffDecision({ ...input, fieldKind });
    assert.equal(result.verdict, "masked", fieldKind);
    assert.equal(result.masked, true);
  }
});

test("keeps masking on when the input or allowance is missing or invalid", () => {
  const wildcardOrigin = "https://%2a.example.test";
  const malformedInputs = [
    undefined,
    null,
    { ...input, origin: undefined },
    { ...input, origin: "" },
    { ...input, origin: `${origin}/page` },
    { ...input, origin: `blob:${origin}/fixture` },
    { ...input, origin: "https://fixture@example.test" },
    { ...input, origin: "https:example.test" },
    { ...input, origin: wildcardOrigin, allowance: { ...input.allowance, origin: wildcardOrigin } },
    { ...input, now: NaN },
    { ...input, now: -Infinity },
    { ...input, allowance: { ...input.allowance, origin: `${origin}?fixture` } },
    { ...input, allowance: { ...input.allowance, expiresAt: Infinity } },
    { ...input, allowance: { ...input.allowance, grantedBy: undefined } },
    { ...input, fieldKind: "unknown" },
    { ...input, requestedBy: undefined },
    { ...input, jobId: " ", allowance: { ...input.allowance, jobId: " " } },
  ];

  for (const malformed of malformedInputs) {
    const result = maskOffDecision(malformed as MaskOffInput);
    assert.equal(result.verdict, "masked");
    assert.equal(result.masked, true);
  }
});

test("returns only a masking decision and does not echo page content", () => {
  const canary = "synthetic-page-text";
  const withPageText = { ...input, pageText: canary };
  const result = maskOffDecision(withPageText);
  assert.deepEqual(Object.keys(result).sort(), ["masked", "reason", "verdict"]);
  assert.equal(JSON.stringify(result).includes(canary), false);
});
