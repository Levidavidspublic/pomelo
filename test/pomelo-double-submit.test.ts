import assert from "node:assert/strict";
import test from "node:test";
import { DOUBLE_SUBMIT_LIMITS, doubleSubmitRule } from "../src/pomelo/browser/double-submit.js";
import { sweepForCanary } from "../src/pomelo/canary-sweep.js";

type RuleInput = Parameters<typeof doubleSubmitRule>[0];
type EarlierSubmit = RuleInput["previousSubmits"][number];

const submit = {
  origin: "https://example.invalid",
  path: "/checkout",
  formKey: "order-form",
  label: "Place order",
  method: "post",
};
const first = { ...submit, at: 100, stepId: "step-1" };
const second = { ...submit, at: 200, stepId: "step-2" };
const input = { submit, previousSubmits: [], now: 300 };

function decide(...previousSubmits: EarlierSubmit[]) {
  return doubleSubmitRule({ ...input, previousSubmits });
}

test("the first submit is allowed", () => {
  const result = decide();
  assert.equal(result.action, "submit");
  assert.equal(result.matchedStepId, undefined);
  assert.match(result.reason, /example\.invalid/);
  assert.ok(Object.isFrozen(DOUBLE_SUBMIT_LIMITS));
});

test("a pending submit waits until the window expires on the supplied clock", () => {
  const previousSubmits = [{ ...first, outcome: "pending" as const }];
  const expiresAt = first.at + DOUBLE_SUBMIT_LIMITS.pendingWindowMs;
  for (const now of [first.at, expiresAt - 1]) {
    const result = doubleSubmitRule({ ...input, previousSubmits, now });
    assert.equal(result.action, "wait");
    assert.equal(result.matchedStepId, first.stepId);
  }
  for (const now of [expiresAt, expiresAt + 1]) {
    const result = doubleSubmitRule({ ...input, previousSubmits, now });
    assert.equal(result.action, "hold");
    assert.equal(result.matchedStepId, first.stepId);
    assert.match(result.reason, /the first press may already have gone through/);
    assert.match(result.reason, /Amit/);
  }
});

test("an unknown outcome holds for Amit even inside the pending window", () => {
  const result = decide({ ...first, outcome: "unknown" });
  assert.equal(result.action, "hold");
  assert.equal(result.matchedStepId, first.stepId);
  assert.match(result.reason, /the first press may already have gone through/);
  assert.match(result.reason, /Amit/);
});

test("navigation and confirmation refuse a repeat press", () => {
  for (const outcome of ["navigated", "confirmed"] as const) {
    const result = decide({ ...first, outcome });
    assert.equal(result.action, "refuse");
    assert.equal(result.matchedStepId, first.stepId);
  }
});

test("a shown error allows one retry and a second shown error holds", () => {
  const failed = { ...first, outcome: "error-shown" as const };
  const retry = decide(failed);
  assert.equal(retry.action, "submit");
  assert.equal(retry.matchedStepId, first.stepId);

  const failedRetry = { ...second, outcome: "error-shown" as const };
  const previousSubmits = Object.freeze([Object.freeze(failed), Object.freeze(failedRetry)]);
  const thirdTry = doubleSubmitRule({ ...input, previousSubmits });
  assert.equal(thirdTry.action, "hold");
  assert.equal(thirdTry.matchedStepId, second.stepId);
  assert.match(thirdTry.reason, /Amit/);
  assert.deepEqual(decide(failedRetry, failed), thirdTry);
  assert.equal(decide(failed, { ...second, outcome: "pending" }).action, "wait");
  assert.equal(decide(failed, { ...second, outcome: "confirmed" }).action, "refuse");
});

test("a later error cannot clear an earlier success or unclear outcome", () => {
  const failed = { ...second, outcome: "error-shown" as const };
  for (const [outcome, action] of [["confirmed", "refuse"], ["unknown", "hold"], ["pending", "wait"]] as const) {
    const result = decide({ ...first, outcome }, failed);
    assert.equal(result.action, action);
    assert.equal(result.matchedStepId, first.stepId);
  }
});

test("the origin, path and form key identify a match", () => {
  const confirmed = { ...first, outcome: "confirmed" as const };
  for (const difference of [{ formKey: "coupon-form" }, { origin: "https://other.example.invalid" }, { path: "/other" }]) {
    assert.equal(decide({ ...confirmed, ...difference }).action, "submit");
  }
  assert.equal(decide({ ...confirmed, origin: "https://EXAMPLE.invalid:443/", label: "Save", method: "get" }).action, "refuse");
});

test("a preceding submit can be matched without a step ID", () => {
  const result = decide({ ...submit, at: first.at, outcome: "confirmed" });
  assert.equal(result.action, "refuse");
  assert.equal(result.matchedStepId, undefined);
});

test("missing and malformed facts or history always hold", () => {
  const invalidInputs = [
    undefined, null, {}, { ...input, submit: null }, { ...input, previousSubmits: undefined },
    { ...input, previousSubmits: {} }, { ...input, previousSubmits: Array(1) },
    ...[undefined, NaN, Infinity, -1, "300"].map((now) => ({ ...input, now })),
    ...[
      { origin: "invalid" }, { origin: `${submit.origin}/checkout` },
      { origin: "https://user@example.invalid" }, { origin: "file:///" },
      { path: "checkout" }, { path: "/checkout?view=cart" }, { formKey: " " },
      { method: " " }, { method: "post now" }, { label: undefined }, { label: 123 },
    ].map((facts) => ({ ...input, submit: { ...submit, ...facts } })),
    ...[null, {}, { ...first, outcome: "other" }, { ...first, at: NaN, outcome: "pending" },
      { ...first, at: input.now + 1, outcome: "pending" },
      { ...first, stepId: 123, outcome: "confirmed" },
      { ...first, formKey: undefined, outcome: "error-shown" },
    ].map((entry) => ({ ...input, previousSubmits: [entry] })),
  ];
  for (const invalid of invalidInputs) {
    assert.equal(doubleSubmitRule(invalid as RuleInput).action, "hold");
  }
});

test("the canary sweep finds zero hits in submit, wait, hold and refuse reasons", () => {
  const canary = "synthetic-submit-canary / +";
  const facts = { ...submit, label: canary, path: `/${encodeURIComponent(canary)}` };
  const step = { ...first, ...facts, note: Buffer.from(canary).toString("base64") };
  const cases = [
    [[], "submit"],
    [[{ ...step, outcome: "pending" }], "wait"],
    [[{ ...step, outcome: "unknown" }], "hold"],
    [[{ ...step, outcome: "confirmed" }], "refuse"],
    [[{ ...step, outcome: "error-shown" }], "submit"],
  ] as const;
  for (const [previousSubmits, action] of cases) {
    const result = doubleSubmitRule({ ...input, submit: facts, previousSubmits });
    assert.equal(result.action, action);
    assert.deepEqual(sweepForCanary(canary, { reason: result.reason }), []);
  }
});
