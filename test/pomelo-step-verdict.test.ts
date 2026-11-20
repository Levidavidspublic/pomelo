import assert from "node:assert/strict";
import test from "node:test";
import { stepVerdict } from "../src/pomelo/browser/step-verdict.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";

test("all go answers clear the step", () => {
  assert.deepEqual(stepVerdict([
    { rule: "site scope", answer: "go" },
    { rule: "certificate", answer: "go" },
  ], ["site scope", "certificate"]), {
    verdict: "go",
    decidedBy: ["certificate", "site scope"],
    missing: [],
    message: "The step can continue because certificate, site scope cleared it.",
  });
});

test("refuse wins over hold, wait, go, and missing answers", () => {
  const result = stepVerdict([
    { rule: "site scope", answer: "refuse" },
    { rule: "terms", answer: "hold" },
    { rule: "settle", answer: "wait", waitMs: 100 },
    { rule: "certificate", answer: "refuse" },
    { rule: "signed out", answer: "go" },
  ], ["passkey"]);
  assert.equal(result.verdict, "refuse");
  assert.deepEqual(result.decidedBy, ["certificate", "site scope"]);
  assert.deepEqual(result.missing, ["passkey"]);
  assert.equal(result.message, "The step was refused by certificate, site scope.");
  assert.equal(result.waitMs, undefined);
});

test("hold wins over wait and names every holding rule in order", () => {
  const result = stepVerdict([
    { rule: "terms", answer: "hold" },
    { rule: "settle", answer: "wait", waitMs: 100 },
    { rule: "one-time code", answer: "hold" },
  ], []);
  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.decidedBy, ["one-time code", "terms"]);
  assert.equal(result.message, "The step is held for you because of one-time code, terms.");
  assert.equal(result.waitMs, undefined);
});

test("missing required checks hold the step and are named as unanswered", () => {
  assert.deepEqual(stepVerdict([
    { rule: "settle", answer: "wait", waitMs: 100 },
    { rule: "terms", answer: "go" },
  ], ["site scope", "terms", "certificate", "certificate"]), {
    verdict: "hold",
    decidedBy: [],
    missing: ["certificate", "site scope"],
    message: "The step is held for you because of missing answers from certificate, site scope.",
  });
});

test("a hold can name both a holding rule and an unanswered check", () => {
  const result = stepVerdict([{ rule: "terms", answer: "hold" }], ["certificate"]);
  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.decidedBy, ["terms"]);
  assert.deepEqual(result.missing, ["certificate"]);
  assert.equal(result.message, "The step is held for you because of terms and missing answers from certificate.");
});

test("empty input holds the step", () => {
  assert.deepEqual(stepVerdict([], []), {
    verdict: "hold",
    decidedBy: [],
    missing: [],
    message: "The step is held for you because no checks answered.",
  });
});

test("a repeated rule contributes its strictest answer once in either order", () => {
  const answers = [
    Object.freeze({ rule: "terms", answer: "go" } as const),
    Object.freeze({ rule: "terms", answer: "hold" } as const),
    Object.freeze({ rule: "terms", answer: "hold" } as const),
  ];
  const required = Object.freeze(["terms"]);
  for (const ordered of [answers, [...answers].reverse()]) {
    const result = stepVerdict(Object.freeze(ordered), required);
    assert.equal(result.verdict, "hold");
    assert.deepEqual(result.decidedBy, ["terms"]);
    assert.deepEqual(result.missing, []);
  }
});

test("an unknown answer holds the step", () => {
  const result = stepVerdict([{ rule: "certificate", answer: "toString" as "go" }], ["certificate"]);
  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.decidedBy, ["certificate"]);
  assert.deepEqual(result.missing, []);
});

test("wait uses the largest duration from the waiting answers and caps it at 60 seconds", () => {
  const answers = [
    { rule: "settle", answer: "wait", waitMs: 5000 },
    { rule: "load", answer: "wait", waitMs: 2500 },
    { rule: "settle", answer: "wait", waitMs: 3000 },
    { rule: "certificate", answer: "go", waitMs: 90000 },
  ] as const;
  const result = stepVerdict(answers, []);
  assert.equal(result.verdict, "wait");
  assert.deepEqual(result.decidedBy, ["load", "settle"]);
  assert.equal(result.waitMs, 5000);
  assert.equal(stepVerdict([...answers, { rule: "load", answer: "wait", waitMs: 75000 }], []).waitMs, 60000);
});

test("wait without a usable duration leaves the duration unset", () => {
  assert.deepEqual(stepVerdict([
    { rule: "load", answer: "wait" },
    { rule: "settle", answer: "wait", waitMs: NaN },
    { rule: "retry", answer: "wait", waitMs: -1 },
  ], []), {
    verdict: "wait",
    decidedBy: ["load", "retry", "settle"],
    missing: [],
    message: "The step is waiting on load, retry, settle.",
  });
});

test("reason codes and extra fields carry no canary text into the verdict", () => {
  const shortCanary = "made-up_FIXTURE-795";
  const longCanary = 'Synthetic fixture text with "quotes", symbols, and a line break.\n';
  const termAnswer = {
    rule: "terms",
    answer: "hold",
    reasonCode: shortCanary,
    details: { [shortCanary]: longCanary },
  } as const;
  const result = stepVerdict([
    termAnswer,
    { rule: "one-time code", answer: "hold", reasonCode: longCanary },
  ], []);
  assert.equal(result.message, "The step is held for you because of one-time code, terms.");
  const sources = { verdict: JSON.stringify(result) };
  assertNoCanary(shortCanary, sources);
  assertNoCanary(longCanary, sources);
});
