import assert from "node:assert/strict";
import test from "node:test";
import { checkSmokeReport } from "../src/pomelo/smoke-report-rule.js";

const title = "opens the app";
const emptyStats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
const emptyCounts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };

function spec(testTitle: string, ...statuses: string[]) {
  return { title: testTitle, tests: [{ results: statuses.map((status) => ({ status })) }] };
}

function report(specs: ReturnType<typeof spec>[], stats: Partial<typeof emptyStats> = {}) {
  return { suites: [{ specs }], stats: { ...emptyStats, ...stats } };
}

test("a report with only first-attempt passes counts as green", () => {
  const input = report([spec(title, "passed"), spec("shows the home page", "passed")], { expected: 2 });
  assert.deepEqual(checkSmokeReport(input, { requiredTitles: [title] }), {
    verdict: "pass",
    reasons: [],
    counts: { ...emptyCounts, passed: 2 },
  });
});

test("a report with no specs does not count even when stats claim a pass", () => {
  for (const stats of [{}, { expected: 1 }]) {
    const result = checkSmokeReport(report([], stats));
    assert.equal(result.verdict, "not-counted");
    assert.deepEqual(result.counts, emptyCounts);
    assert.ok(result.reasons.some((reason) => reason.code === "no-tests"));
    assert.equal(result.reasons.some((reason) => reason.code === "stats-mismatch"), stats.expected === 1);
  }
});

test("a skipped test keeps the run from passing even if another test passes", () => {
  const result = checkSmokeReport(report([spec(title, "skipped"), spec("shows the home page", "passed")], {
    expected: 1,
    skipped: 1,
  }));
  assert.equal(result.verdict, "fail");
  assert.deepEqual(result.counts, { ...emptyCounts, passed: 1, skipped: 1 });
  assert.equal(result.reasons[0].code, "skipped");
  assert.equal(result.reasons[0].title, title);
  assert.match(result.reasons[0].message, /skipped/i);
});

test("a fixme test with no attempts counts as skipped", () => {
  const input = {
    suites: [{ specs: [{
      title,
      tests: [{ expectedStatus: "skipped", annotations: [{ type: "fixme" }], results: [] }],
    }] }],
    stats: { ...emptyStats, skipped: 1 },
  };
  const result = checkSmokeReport(input);
  assert.equal(result.verdict, "fail");
  assert.deepEqual(result.counts, { ...emptyCounts, skipped: 1 });
  assert.match(result.reasons[0].message, /skipped|fixme/i);
});

test("failures, timeouts and interruptions are counted once per test", () => {
  for (const [status, code, message] of [
    ["failed", "failed", /failed/i],
    ["timedOut", "timed-out", /timed out/i],
    ["interrupted", "interrupted", /interrupted/i],
  ] as const) {
    const result = checkSmokeReport(report([spec(title, status)], { unexpected: 1 }));
    assert.equal(result.verdict, "fail");
    assert.deepEqual(result.counts, { ...emptyCounts, failed: 1 });
    assert.equal(result.reasons[0].code, code);
    assert.match(result.reasons[0].message, message);
  }
});

test("a failed test that passes on retry counts as flaky", () => {
  const result = checkSmokeReport(report([spec(title, "failed", "passed")], { flaky: 1 }));
  assert.equal(result.verdict, "fail");
  assert.deepEqual(result.counts, { ...emptyCounts, flaky: 1 });
  assert.equal(result.reasons[0].code, "flaky");
  assert.match(result.reasons[0].message, /retry/i);
});

test("a reported pass with a nonzero retry number cannot count as a first-attempt pass", () => {
  const input = {
    suites: [{ specs: [{ title, tests: [{ results: [{ status: "passed", retry: 1 }] }] }] }],
    stats: { ...emptyStats, expected: 1 },
  };
  const result = checkSmokeReport(input);
  assert.equal(result.verdict, "fail");
  assert.deepEqual(result.counts, { ...emptyCounts, flaky: 1 });
  assert.deepEqual(result.reasons.map((reason) => reason.code), ["flaky", "stats-mismatch"]);
});

test("nested suites contribute their titles and each test under a spec counts", () => {
  const smoke = spec(title, "passed");
  smoke.tests.push({ results: [{ status: "passed" }] });
  const input = {
    suites: [{ specs: [], suites: [{ specs: [], suites: [{ specs: [smoke] }] }] }],
    stats: { ...emptyStats, expected: 2 },
  };
  const result = checkSmokeReport(input, { requiredTitles: [title] });
  assert.equal(result.verdict, "pass");
  assert.equal(result.counts.passed, 2);
});

test("a required test title must match the full title exactly", () => {
  const missingTitle = "opens the app in the desktop window";
  const result = checkSmokeReport(report([spec(title, "passed")], { expected: 1 }), {
    requiredTitles: [missingTitle],
  });
  assert.equal(result.verdict, "fail");
  assert.equal(result.counts.passed, 1);
  assert.equal(result.reasons[0].code, "missing-required-title");
  assert.equal(result.reasons[0].title, missingTitle);
  assert.match(result.reasons[0].message, /missing/i);
});

test("inconsistent stats cannot make a report green", () => {
  const passing = checkSmokeReport(report([spec(title, "passed")], { expected: 2 }));
  assert.equal(passing.verdict, "not-counted");
  assert.deepEqual(passing.counts, { ...emptyCounts, passed: 1 });
  assert.equal(passing.reasons[0].code, "stats-mismatch");

  const failing = checkSmokeReport(report([spec(title, "failed")], { expected: 1 }));
  assert.equal(failing.verdict, "fail");
  assert.deepEqual(failing.counts, { ...emptyCounts, failed: 1 });
  assert.deepEqual(failing.reasons.map((reason) => reason.code), ["failed", "stats-mismatch"]);
});

test("a Playwright runner error fails the run even after a clean test pass", () => {
  const input = { ...report([spec(title, "passed")], { expected: 1 }), errors: [{ message: "Teardown failed" }] };
  const result = checkSmokeReport(input);
  assert.equal(result.verdict, "fail");
  assert.deepEqual(result.counts, { ...emptyCounts, passed: 1 });
  assert.equal(result.reasons[0].code, "runner-error");
});

test("invalid input does not count as a Playwright report", () => {
  const cyclic: { specs: unknown[]; suites: unknown[] } = { specs: [], suites: [] };
  cyclic.suites.push(cyclic);
  for (const input of [
    null,
    "text report",
    { tests: 1, passed: 1 },
    { suites: [], stats: { ...emptyStats, expected: "1" } },
    { suites: [{ specs: [null] }], stats: emptyStats },
    report([spec(title, "unknown")], { expected: 1 }),
    { suites: [cyclic], stats: emptyStats },
    { get suites() { throw new Error("Unreadable"); } },
  ]) {
    const result = checkSmokeReport(input);
    assert.equal(result.verdict, "not-counted");
    assert.deepEqual(result.counts, emptyCounts);
    assert.equal(result.reasons[0].code, "invalid-report");
    assert.match(result.reasons[0].message, /Playwright/i);
  }
});

test("long titles are matched in full and capped at 120 characters in messages", () => {
  const longTitle = "a".repeat(120) + " app";
  const input = report([spec(longTitle, "failed")], { unexpected: 1 });
  const result = checkSmokeReport(input, { requiredTitles: [longTitle] });
  assert.equal(result.reasons.length, 1);
  assert.equal(result.reasons[0].title, longTitle);
  assert.doesNotMatch(result.reasons[0].message, /a{121}| app/);
  assert.match(result.reasons[0].message, /a{119}…/);
});
