import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RUN_BUDGET, runBudget, type RunBudgetInput } from "../src/pomelo/run-budget.js";

const startedAt = 1_000_000;
const minute = 60_000;
const limits = { maxMinutes: 10, maxAttempts: 5, maxStuckInARow: 3 };
const run: RunBudgetInput = { startedAt, now: startedAt, attemptsUsed: 0, outcomes: [], limits };

test("a run under every limit can go on with its remaining minutes and attempts", () => {
  const result = runBudget({ ...run, now: startedAt + 2.5 * minute, attemptsUsed: 2, outcomes: ["stuck", "stuck"] });
  assert.deepEqual(result, { verdict: "go", reasons: [], left: { minutes: 7.5, attempts: 3 } });
});

test("the run stops at the time limit, even with attempts left", () => {
  const deadline = startedAt + 10 * minute;
  assert.equal(runBudget({ ...run, now: deadline - 1 }).verdict, "go");
  const result = runBudget({ ...run, now: deadline });
  assert.equal(result.verdict, "stop");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /time.*10 minutes/i);
  assert.deepEqual(result.left, { minutes: 0, attempts: 5 });
});

test("the run stops at the attempt limit, even with time left", () => {
  assert.equal(runBudget({ ...run, attemptsUsed: 4 }).verdict, "go");
  const result = runBudget({ ...run, attemptsUsed: 5 });
  assert.equal(result.verdict, "stop");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /attempt.*5 attempts/i);
  assert.deepEqual(result.left, { minutes: 10, attempts: 0 });
});

test("three stuck tickets in a row stop the run and a merge resets the streak", () => {
  const result = runBudget({ ...run, outcomes: ["stuck", "stuck", "stuck"] });
  assert.equal(result.verdict, "stop");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /stuck.*3 in a row/i);
  assert.deepEqual(result.left, { minutes: 10, attempts: 5 });
  assert.equal(runBudget({ ...run, outcomes: ["stuck", "merged", "stuck", "stuck"] }).verdict, "go");
});

test("held tickets neither add to the streak nor reset it", () => {
  assert.equal(runBudget({ ...run, outcomes: ["stuck", "held", "stuck", "held"] }).verdict, "go");
  const result = runBudget({ ...run, outcomes: ["stuck", "held", "stuck", "held", "stuck", "held"] });
  assert.equal(result.verdict, "stop");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /stuck/i);
});

test("the run reports every limit reached and never shows negative amounts left", () => {
  const overBudget = { ...run, now: startedAt + 11 * minute, attemptsUsed: 6 };
  const result = runBudget(overBudget);
  assert.equal(result.verdict, "stop");
  assert.equal(result.reasons.length, 2);
  assert.ok(result.reasons.some((reason) => /time/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /attempt/i.test(reason)));
  assert.deepEqual(result.left, { minutes: 0, attempts: 0 });

  const allLimits = runBudget({ ...overBudget, outcomes: ["stuck", "stuck", "stuck"] });
  assert.equal(allLimits.verdict, "stop");
  assert.equal(allLimits.reasons.length, 3);
  assert.ok(allLimits.reasons.some((reason) => /stuck/i.test(reason)));
});

test("a zero limit stops a fresh run", () => {
  const result = runBudget({ ...run, startedAt: 0, now: 0, limits: { ...limits, maxAttempts: 0 } });
  assert.equal(result.verdict, "stop");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /attempt/i);
  assert.deepEqual(result.left, { minutes: 10, attempts: 0 });
});

test("negative, non-finite or missing numbers stop the run with a bad input reason", () => {
  const invalidInputs: RunBudgetInput[] = [{ ...run, now: startedAt - 1 }];
  for (const value of [-1, NaN, Infinity, undefined]) {
    for (const field of ["startedAt", "now", "attemptsUsed"] as const) {
      invalidInputs.push({ ...run, [field]: value } as RunBudgetInput);
    }
    for (const field of ["maxMinutes", "maxAttempts", "maxStuckInARow"] as const) {
      invalidInputs.push({ ...run, limits: { ...limits, [field]: value } } as RunBudgetInput);
    }
  }

  for (const input of invalidInputs) {
    const result = runBudget(input);
    assert.equal(result.verdict, "stop");
    assert.ok(result.reasons.some((reason) => /bad input/i.test(reason)));
    assert.deepEqual(result.left, { minutes: 0, attempts: 0 });
  }
});

test("frozen defaults apply when limits are omitted", () => {
  const { maxMinutes, maxAttempts, maxStuckInARow } = DEFAULT_RUN_BUDGET;
  assert.ok(Object.isFrozen(DEFAULT_RUN_BUDGET));
  const fresh = { startedAt, now: startedAt, attemptsUsed: 0, outcomes: [] };
  assert.deepEqual(runBudget(fresh), { verdict: "go", reasons: [], left: { minutes: maxMinutes, attempts: maxAttempts } });
  assert.equal(runBudget({ ...fresh, now: startedAt + maxMinutes * minute }).verdict, "stop");
  assert.equal(runBudget({ ...fresh, attemptsUsed: maxAttempts }).verdict, "stop");
  const outcomes = Array.from({ length: maxStuckInARow }, () => "stuck" as const);
  assert.equal(runBudget({ ...fresh, outcomes }).verdict, "stop");
});
