import assert from "node:assert/strict";
import test from "node:test";
import { findSlowTests } from "../src/pomelo/slow-tests.js";

test("fast spec results pass and the run summary does not count as a timing", () => {
  assert.deepEqual(findSlowTests("✔ first test (12.3ms)\n✔ second test (9ms)\nℹ duration_ms 24000"), {
    ok: true,
    slow: [],
    slowestMs: 12.3,
    reasons: [],
  });
});

test("names a slow spec test and picks up the file from Friday's single-file command", () => {
  const output = [
    "> node scripts/test.mjs test/pomelo-example.test.ts",
    "✔ passes quickly (2000ms)",
    "✖ after setup (2000.5ms)",
  ].join("\n");
  const result = findSlowTests(output);
  assert.equal(result.ok, false);
  assert.deepEqual(result.slow, [
    { name: "after setup", file: "test/pomelo-example.test.ts", ms: 2000.5, limitMs: 2000 },
  ]);
  assert.equal(result.slowestMs, 4000.5);
  assert.match(result.reasons.join(" "), /after setup.*2000\.5/);
});

test("names the file when individually fast tests exceed the file budget together", () => {
  const output = [
    "> node scripts/test.mjs test/pomelo-example.test.ts",
    "✔ first (2000ms)",
    "✔ second (2000ms)",
    "✔ third (2000ms)",
    "✔ fourth (2000ms)",
    "✔ fifth (2000ms)",
    "✔ sixth (2000ms)",
    "✔ seventh (2000ms)",
    "✔ eighth (2000ms)",
    "✔ ninth (2000ms)",
    "✔ tenth (2000ms)",
    "✔ last (12.3ms)",
  ].join("\n");
  const result = findSlowTests(output);
  assert.equal(result.ok, false);
  assert.deepEqual(result.slow, [
    { name: "test/pomelo-example.test.ts", file: "test/pomelo-example.test.ts", ms: 20012.3, limitMs: 20000 },
  ]);
  assert.equal(result.slowestMs, 20012.3);
});

test("reads TAP timings and a failed test's source location", () => {
  const output = [
    "TAP version 13",
    "# Subtest: fast case",
    "ok 1 - fast case",
    "  ---",
    "  duration_ms: 12.3",
    "  ...",
    "# Subtest: slow \\# case",
    "not ok 2 - slow \\# case # TODO",
    "  ---",
    "  duration_ms: 2100.25",
    "  location: 'test/pomelo-tap.test.ts:4:1'",
    "  error: |-",
    "    duration_ms: 99999",
    "  ...",
    "1..2",
    "# duration_ms 25000",
  ].join("\n");
  const result = findSlowTests(output);
  assert.equal(result.ok, false);
  assert.deepEqual(result.slow, [
    { name: "slow # case", file: "test/pomelo-tap.test.ts", ms: 2100.25, limitMs: 2000 },
  ]);
  assert.equal(result.slowestMs, 2100.25);
});

test("keeps separate file totals and counts nested spec durations once", () => {
  const output = [
    "▶ test/pomelo-first.test.ts",
    "  ▶ suite",
    "    ✔ child (9ms)",
    "  ✔ suite (12ms)",
    "  ✔ another (6ms)",
    "✔ test/pomelo-first.test.ts (19ms)",
    "▶ test/pomelo-second.test.ts",
    "  ✔ unrelated (9ms)",
    "✔ test/pomelo-second.test.ts (10ms)",
  ].join("\n");
  assert.deepEqual(findSlowTests(output, { testMs: 12, fileMs: 18 }).slow, [
    { name: "test/pomelo-first.test.ts", file: "test/pomelo-first.test.ts", ms: 19, limitMs: 18 },
  ]);
});

test("totals TAP children under their file heading when the file duration is shorter", () => {
  const output = [
    "TAP version 13",
    "# Subtest: test/pomelo-group.test.ts",
    "    # Subtest: first",
    "    ok 1 - first",
    "      ---",
    "      duration_ms: 15",
    "      ...",
    "    # Subtest: second",
    "    ok 2 - second",
    "      ---",
    "      duration_ms: 16",
    "      ...",
    "    1..2",
    "ok 1 - test/pomelo-group.test.ts",
    "  ---",
    "  duration_ms: 28",
    "  ...",
  ].join("\n");
  assert.deepEqual(findSlowTests(output, { testMs: 16, fileMs: 30 }).slow, [
    { name: "test/pomelo-group.test.ts", file: "test/pomelo-group.test.ts", ms: 31, limitMs: 30 },
  ]);
});

test("a file result has its own limit and the file limit is inclusive", () => {
  assert.equal(findSlowTests("✔ test/pomelo-startup.test.ts (20000ms)").ok, true);
  assert.deepEqual(findSlowTests("✖ test/pomelo-startup.test.ts (20001ms)").slow, [
    { name: "test/pomelo-startup.test.ts", file: "test/pomelo-startup.test.ts", ms: 20001, limitMs: 20000 },
  ]);
});

test("converts seconds to milliseconds and accepts a partial limit override", () => {
  const output = "✔ example (1.2s)";
  assert.equal(findSlowTests(output).slowestMs, 1200);
  assert.deepEqual(findSlowTests(output, { testMs: 1000 }).slow, [
    { name: "example", ms: 1200, limitMs: 1000 },
  ]);
});

test("ignores ANSI colours and handles Windows paths and line endings", () => {
  const output = "\x1b[32m✔ \x1b[39mtest\\pomelo-colour.test.ts \x1b[90m(21000ms)\x1b[39m\r\n";
  assert.deepEqual(findSlowTests(output).slow, [
    { name: "test/pomelo-colour.test.ts", file: "test/pomelo-colour.test.ts", ms: 21000, limitMs: 20000 },
  ]);
});

test("a flat multi-file run still names a slow test when its file is unknown", () => {
  const output = [
    "> node scripts/test.mjs test/pomelo-first.test.ts test/pomelo-second.test.ts",
    "✔ slow case (2100ms)",
  ].join("\n");
  assert.deepEqual(findSlowTests(output).slow, [{ name: "slow case", ms: 2100, limitMs: 2000 }]);
});

test("uses spec failure locations without counting repeated footer timings", () => {
  const output = [
    "> node scripts/test.mjs test/pomelo-first.test.ts test/pomelo-second.test.ts",
    "✖ slow case (2100ms)",
    "✖ slow case (2100ms)",
    "ℹ duration_ms 5000",
    "",
    "✖ failing tests:",
    "",
    "test at test/pomelo-first.test.ts:1:1",
    "✖ slow case (2100ms)",
    "",
    "test at test/pomelo-second.test.ts:2:1",
    "✖ slow case (2100ms)",
  ].join("\n");
  assert.deepEqual(findSlowTests(output, { fileMs: 3000 }).slow, [
    { name: "slow case", file: "test/pomelo-first.test.ts", ms: 2100, limitMs: 2000 },
    { name: "slow case", file: "test/pomelo-second.test.ts", ms: 2100, limitMs: 2000 },
  ]);
});

test("fails with a plain reason when there are no named timings", () => {
  for (const output of ["", "ok 1 - missing timing\n# duration_ms 12.3", "duration_ms: 12.3\nℹ duration_ms 900"]) {
    assert.deepEqual(findSlowTests(output), {
      ok: false,
      slow: [],
      slowestMs: 0,
      reasons: ["No test or file timings found in the run output."],
    });
  }
});

test("cuts long test names to 120 characters in the finding and reason", () => {
  const name = "a".repeat(120);
  const result = findSlowTests(`✔ ${name} extra text (3000ms)`);
  assert.deepEqual(result.slow, [{ name, ms: 3000, limitMs: 2000 }]);
  assert.match(result.reasons.join(" "), new RegExp(name));
  assert.doesNotMatch(result.reasons.join(" "), /extra text/);
});
