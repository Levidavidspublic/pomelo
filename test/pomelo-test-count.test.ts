import assert from "node:assert/strict";
import test from "node:test";
import { compareTestCounts, readTestSummary } from "../src/pomelo/test-count.js";

const cleanCounts = { tests: 12, pass: 12, fail: 0, cancelled: 0, skipped: 0, todo: 0 };

function summary(prefix: "#" | "ℹ", counts: Partial<typeof cleanCounts> = {}): string {
  return [
    `${prefix} tests ${counts.tests ?? cleanCounts.tests}`,
    `${prefix} suites 0`,
    `${prefix} pass ${counts.pass ?? cleanCounts.pass}`,
    `${prefix} fail ${counts.fail ?? cleanCounts.fail}`,
    `${prefix} cancelled ${counts.cancelled ?? cleanCounts.cancelled}`,
    `${prefix} skipped ${counts.skipped ?? cleanCounts.skipped}`,
    `${prefix} todo ${counts.todo ?? cleanCounts.todo}`,
    `${prefix} duration_ms 42.5`,
  ].join("\n");
}

test("equal totals pass across TAP and spec", () => {
  assert.deepEqual(compareTestCounts(summary("#"), summary("ℹ")), {
    ok: true,
    base: cleanCounts,
    pr: cleanCounts,
    problems: [],
  });
});

test("adding passing tests is allowed", () => {
  const added = { ...cleanCounts, tests: 14, pass: 14 };
  assert.deepEqual(compareTestCounts(summary("ℹ"), summary("#", added)), {
    ok: true,
    base: cleanCounts,
    pr: added,
    problems: [],
  });
});

test("dropping tests fails even when the pass count stays the same", () => {
  const result = compareTestCounts(summary("#", { tests: 13, todo: 1 }), summary("ℹ"));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ["The test count fell from 13 to 12."]);
});

test("dropping passes fails even when the test count stays the same", () => {
  const result = compareTestCounts(summary("ℹ"), summary("#", { pass: 11, skipped: 1 }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [
    "The pass count fell from 12 to 11.",
    "The skipped count rose from 0 to 1.",
  ]);
});

test("adding a skip fails even when the tests and passes increase", () => {
  const result = compareTestCounts(summary("#"), summary("ℹ", { tests: 14, pass: 13, skipped: 1 }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ["The skipped count rose from 0 to 1."]);
});

test("adding a todo fails even when the tests and passes increase", () => {
  const result = compareTestCounts(summary("ℹ"), summary("#", { tests: 14, pass: 13, todo: 1 }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ["The todo count rose from 0 to 1."]);
});

test("an unchanged nonzero failure count fails", () => {
  const failures = { pass: 11, fail: 1 };
  const result = compareTestCounts(summary("#", failures), summary("ℹ", failures));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ["The PR failure count is 1 (base 1)."]);
});

test("an unchanged nonzero cancellation count fails", () => {
  const cancellations = { pass: 11, cancelled: 1 };
  const result = compareTestCounts(summary("ℹ", cancellations), summary("#", cancellations));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ["The PR cancellation count is 1 (base 1)."]);
});

test("reports all regressions in a steady order", () => {
  const pr = { tests: 10, pass: 5, fail: 2, cancelled: 1, skipped: 1, todo: 1 };
  assert.deepEqual(compareTestCounts(summary("#"), summary("ℹ", pr)), {
    ok: false,
    base: cleanCounts,
    pr,
    problems: [
      "The PR failure count is 2 (base 0).",
      "The PR cancellation count is 1 (base 0).",
      "The test count fell from 12 to 10.",
      "The pass count fell from 12 to 5.",
      "The skipped count rose from 0 to 1.",
      "The todo count rose from 0 to 1.",
    ],
  });
});

test("a missing base summary fails with a reason", () => {
  assert.deepEqual(compareTestCounts("No runner output", summary("ℹ")), {
    ok: false,
    base: undefined,
    pr: cleanCounts,
    problems: ["Could not find a complete base test summary."],
  });
});

test("a missing PR summary fails with a reason", () => {
  assert.deepEqual(compareTestCounts(summary("#"), "Test run stopped"), {
    ok: false,
    base: cleanCounts,
    pr: undefined,
    problems: ["Could not find a complete PR test summary."],
  });
});

test("reads summaries amid log noise, colors, and Windows line endings", () => {
  const output = [
    "> node scripts/test.mjs",
    "\x1b[34mℹ tests 12\x1b[39m",
    "ℹ suites 0",
    "ℹ pass 12",
    "Test worker finished",
    "ℹ fail 0",
    "ℹ cancelled 0",
    "ℹ skipped 0",
    "ℹ todo 0",
    "ℹ duration_ms 42.5",
    "Post-run note: ℹ fail 55",
    "    ℹ tests 55",
  ].join("\r\n");

  assert.deepEqual(readTestSummary(output), cleanCounts);
});

test("compares the last summary from each capture", () => {
  const base = [summary("#", { tests: 99, pass: 99 }), "New run", summary("ℹ")].join("\n");
  const pr = [summary("ℹ", { pass: 11, fail: 1 }), "New run", summary("#")].join("\n");

  assert.deepEqual(compareTestCounts(base, pr), {
    ok: true,
    base: cleanCounts,
    pr: cleanCounts,
    problems: [],
  });
});

test("a truncated final summary cannot borrow counts from another block or reporter", () => {
  const pr = [summary("#"), "ℹ tests 12", "ℹ pass 12", "# fail 0", "# cancelled 0", "# skipped 0", "# todo 0"].join("\n");

  assert.deepEqual(compareTestCounts(summary("#"), pr), {
    ok: false,
    base: cleanCounts,
    pr: undefined,
    problems: ["Could not find a complete PR test summary."],
  });
});
