import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_JOB_BUDGET, jobBudgetCheck } from "../src/pomelo/browser/job-budget.js";

const startedAt = 1_000_000;
const freshJob = { startedAt, stepCount: 0, steps: [] };
const budget = { maxMs: 1_000, maxSteps: 10, maxSameStepRepeats: 5 };
const click = { kind: "click", target: "button" };

test("a fresh job is within budget", () => {
  const result = jobBudgetCheck(freshJob, budget, startedAt);
  assert.equal(result.verdict, "ok");
  assert.deepEqual(result.used, { ms: 0, steps: 0, sameStepRepeats: 0 });
});

test("time warns at 80 percent and holds once the limit is passed", () => {
  for (const [ms, verdict] of [[799, "ok"], [800, "warn"], [1_000, "warn"], [1_001, "hold"]] as const) {
    const result = jobBudgetCheck(freshJob, budget, startedAt + ms);
    assert.equal(result.verdict, verdict);
    assert.equal(result.used.ms, ms);
    if (verdict !== "ok") {
      assert.match(result.reason, new RegExp(`\\b${ms}\\b`));
      assert.match(result.reason, /\b1000\b/);
    }
  }
});

test("steps warn at 80 percent and hold once the limit is passed, even when time only warns", () => {
  for (const [stepCount, verdict] of [[7, "ok"], [8, "warn"], [10, "warn"], [11, "hold"]] as const) {
    const now = stepCount === 11 ? startedAt + 800 : startedAt;
    const result = jobBudgetCheck({ ...freshJob, stepCount }, budget, now);
    assert.equal(result.verdict, verdict);
    assert.equal(result.used.steps, stepCount);
    if (verdict !== "ok") assert.match(result.reason, /\b10\b/);
  }
});

test("consecutive clicks on the same target warn and then hold as repeats accumulate", () => {
  for (const [sameStepRepeats, verdict] of [[0, "ok"], [3, "ok"], [4, "warn"], [5, "warn"], [6, "hold"]] as const) {
    const steps = Array.from({ length: sameStepRepeats + 1 }, () => click);
    const result = jobBudgetCheck({ startedAt, stepCount: steps.length, steps }, budget, startedAt);
    assert.equal(result.verdict, verdict);
    assert.equal(result.used.sameStepRepeats, sameStepRepeats);
    if (verdict !== "ok") assert.match(result.reason, /\b5\b/);
  }
});

test("a different kind or target breaks the repeat streak", () => {
  const earlierClicks = Array.from({ length: 7 }, () => click);
  for (const different of [{ ...click, kind: "read" }, { ...click, target: "other button" }]) {
    const steps = [...earlierClicks, different, click, click];
    const result = jobBudgetCheck({ startedAt, stepCount: steps.length, steps }, { ...budget, maxSteps: 50 }, startedAt);
    assert.equal(result.verdict, "ok");
    assert.equal(result.used.sameStepRepeats, 1);
  }
});

test("missing, zero, negative and non-finite budget values fall back to defaults", () => {
  const { maxMs, maxSteps, maxSameStepRepeats } = DEFAULT_JOB_BUDGET;
  assert.ok(Number.isFinite(maxMs) && maxMs > 0);
  assert.ok(Number.isSafeInteger(maxSteps) && maxSteps > 0);
  assert.ok(Number.isSafeInteger(maxSameStepRepeats) && maxSameStepRepeats > 0);

  for (const invalid of [undefined, 0, -1, NaN, Infinity]) {
    assert.equal(jobBudgetCheck(freshJob, { maxMs: invalid }, startedAt + maxMs + 1).verdict, "hold");
    const manySteps = { ...freshJob, stepCount: maxSteps + 1 };
    assert.equal(jobBudgetCheck(manySteps, { maxSteps: invalid, maxMs: 10 }, startedAt).verdict, "hold");
    const steps = Array.from({ length: maxSameStepRepeats + 2 }, () => click);
    const repeated = { startedAt, stepCount: steps.length, steps };
    assert.equal(jobBudgetCheck(repeated, { maxSameStepRepeats: invalid, maxSteps: steps.length + 10 }, startedAt).verdict, "hold");
  }

  assert.equal(jobBudgetCheck(freshJob, undefined, startedAt + maxMs + 1).verdict, "hold");
  assert.equal(jobBudgetCheck(freshJob, { maxMs: 10, maxSteps: 0 }, startedAt + 11).verdict, "hold");
});

test("a start time in the future counts as zero milliseconds used", () => {
  const result = jobBudgetCheck(freshJob, budget, startedAt - 100);
  assert.equal(result.verdict, "ok");
  assert.equal(result.used.ms, 0);
});

test("reasons keep step text, targets and values private", () => {
  const step = { kind: "fill", target: "target-canary", text: "text-canary", value: "value-canary" };
  for (const [stepCount, verdict] of [[1, "ok"], [5, "warn"], [7, "hold"]] as const) {
    const steps = Array.from({ length: stepCount }, (_, index) => ({ ...step, text: `${step.text}-${index}` }));
    const result = jobBudgetCheck({ startedAt, stepCount, steps }, budget, startedAt);
    assert.equal(result.verdict, verdict);
    assert.doesNotMatch(result.reason, /target-canary|text-canary|value-canary|fill/);
  }
});

test("local and cloud profiles get the same verdict, reason and usage", () => {
  const job = { ...freshJob, stepCount: 11 };
  const localJob = { ...job, profileId: "local-profile" };
  const cloudJob = { ...job, profileId: "cloud-profile" };
  const localResult = jobBudgetCheck(localJob, budget, startedAt);
  assert.equal(localResult.verdict, "hold");
  assert.deepEqual(jobBudgetCheck(cloudJob, budget, startedAt), localResult);
});
