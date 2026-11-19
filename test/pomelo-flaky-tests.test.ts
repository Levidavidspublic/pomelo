import assert from "node:assert/strict";
import test from "node:test";
import { findFlakyTestLines, type FlakyTestLine } from "../src/pomelo/flaky-tests.js";

const path = "test/pomelo-example.test.ts";
const clean = { ok: true, findings: [] };

function check(addedLines: readonly FlakyTestLine[]) {
  return findFlakyTestLines([{ path, addedLines }]);
}

test("reports real clock, randomness and waits on their own added lines", () => {
  assert.deepEqual(check([
    { line: 3, text: "const time = Date.now();" },
    { line: 5, text: "const today = new Date(/* current time */);" },
    { line: 8, text: "const start = performance . now ();" },
    { line: 13, text: "const value = Math.random();" },
    { line: 21, text: "const uuid = crypto.randomUUID();" },
    { line: 22, text: "const bytes = randomBytes(8);" },
    { line: 34, text: "await new Promise((resolve) => setTimeout(resolve, delay));" },
    { line: 35, text: "setInterval(() => assert.equal(a, b), 20);" },
    { line: 36, text: "await sleep(20);" },
    { line: 37, text: "await setTimeout(20);" },
  ]), {
    ok: false,
    findings: [
      { path, line: 3, kind: "clock" },
      { path, line: 5, kind: "clock" },
      { path, line: 8, kind: "clock" },
      { path, line: 13, kind: "random" },
      { path, line: 21, kind: "random" },
      { path, line: 22, kind: "random" },
      { path, line: 34, kind: "sleep" },
      { path, line: 35, kind: "sleep" },
      { path, line: 36, kind: "sleep" },
      { path, line: 37, kind: "sleep" },
    ],
  });
});

test("ignores fixed dates, similar names and callback timers without an explicit delay", () => {
  assert.deepEqual(check([
    { line: 1, text: 'new Date("2026-11-19T00:00:00Z");' },
    { line: 2, text: "new Date(0);" },
    { line: 3, text: "new Date(2026, 10, 19);" },
    { line: 4, text: "setTimeout(() => assert.equal(a, b));" },
    { line: 5, text: "setInterval(callback,);" },
    { line: 6, text: "FakeDate.now(); Math.randomSeed(); randomBytesFixture(8);" },
  ]), clean);
});

test("ignores comments and literal text while scanning template expressions", () => {
  assert.deepEqual(check([
    { line: 1, text: "// Date.now(); Math.random(); await sleep(20);" },
    { line: 2, text: "/* Date.now(); Math.random(); await sleep(20); */" },
    { line: 3, text: "/* starts here" },
    { line: 4, text: "Date.now(); Math.random(); await sleep(20);" },
    { line: 5, text: "*/ new Date();" },
    { line: 6, text: 'const double = "Date.now(); Math.random(); await sleep(20);";' },
    { line: 7, text: "const single = '/* randomUUID() */';" },
    { line: 8, text: 'const escaped = "\\"Date.now()";' },
    { line: 9, text: "const template = `Date.now()" },
    { line: 10, text: "Math.random(); await sleep(20);" },
    { line: 11, text: "${Math.random()}`;" },
    { line: 12, text: "const pattern = /Date.now()/;" },
    { line: 13, text: "const fraction = 10 / Date.now();" },
  ]), {
    ok: false,
    findings: [
      { path, line: 5, kind: "clock" },
      { path, line: 11, kind: "random" },
      { path, line: 13, kind: "clock" },
    ],
  });
});

test("handles multiline calls and code after a gap in the additions", () => {
  assert.deepEqual(check([
    { line: 1, text: "setTimeout(" },
    { line: 2, text: "  () => assert.equal(a, b)," },
    { line: 3, text: "  delay," },
    { line: 4, text: ");" },
    { line: 5, text: "new Date(" },
    { line: 6, text: "  0," },
    { line: 7, text: ");" },
    { line: 8, text: "/* comment that may close on a line absent from the diff" },
    { line: 10, text: "performance.now();" },
  ]), {
    ok: false,
    findings: [{ path, line: 1, kind: "sleep" }, { path, line: 10, kind: "clock" }],
  });
});

test("checks only top-level Pomelo test files", () => {
  assert.deepEqual(findFlakyTestLines([
    "test/friday.test.ts",
    "src/pomelo-example.test.ts",
    "test/nested/pomelo-example.test.ts",
    "test/pomelo-nested/example.test.ts",
    "test/pomelo-example.test.ts.bak",
  ].map((path) => ({ path, addedLines: [{ line: 1, text: "Date.now();" }] }))), clean);
});

test("accepts malformed input without producing findings", () => {
  for (const input of [null, undefined, {}, "test", [], [
    null,
    { addedLines: [{ line: 1, text: "Date.now();" }] },
    { path, addedLines: false },
    { path, addedLines: [null, { text: "Date.now();" }, { line: "2", text: "Date.now();" }, { line: 3 }] },
  ]]) {
    assert.deepEqual(findFlakyTestLines(input), clean);
  }
});

test("emits each kind once per line and never returns the source text", () => {
  const result = check([{ line: 7, text: "const exampleMarker = Date.now() + Date.now() + Math.random();" }]);
  assert.deepEqual(result, {
    ok: false,
    findings: [{ path, line: 7, kind: "clock" }, { path, line: 7, kind: "random" }],
  });
  assert.equal(JSON.stringify(result).includes("exampleMarker"), false);
});
