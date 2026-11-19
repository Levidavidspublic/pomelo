import assert from "node:assert/strict";
import test from "node:test";
import { findSkippedTests, type SkippedTestFile } from "../src/pomelo/skipped-tests.js";

test("reports node:test methods with their added line numbers and kinds", () => {
  const path = "test/nested/example.test.ts";
  const files: SkippedTestFile[] = [{
    path,
    addedLines: [
      { line: 3, text: 'test.skip("example", () => {});' },
      { line: 7, text: 'it.skip("example", () => {});' },
      { line: 8, text: 'describe.skip("example", () => {});' },
      { line: 11, text: 'test.only("example", () => {});' },
      { line: 12, text: 'it . only ("example", () => {});' },
      { line: 17, text: 'describe.only("example", () => {});' },
      { line: 19, text: 'suite.only("example", () => {});' },
      { line: 24, text: 'test.todo("example");' },
      { line: 25, text: 'it.todo("example");' },
      { line: 26, text: 'describe.todo("example");' },
      { line: 28, text: 'if (condition) return t.skip("reason");' },
      { line: 33, text: 't.todo("reason");' },
    ],
  }];

  assert.deepEqual(findSkippedTests(files), {
    ok: false,
    findings: [
      { path, line: 3, kind: "skip" },
      { path, line: 7, kind: "skip" },
      { path, line: 8, kind: "skip" },
      { path, line: 11, kind: "only" },
      { path, line: 12, kind: "only" },
      { path, line: 17, kind: "only" },
      { path, line: 19, kind: "only" },
      { path, line: 24, kind: "todo" },
      { path, line: 25, kind: "todo" },
      { path, line: 26, kind: "todo" },
      { path, line: 28, kind: "skip" },
      { path, line: 33, kind: "todo" },
    ],
  });
});

test("reports runner options on the lines where they are added", () => {
  const path = "test/options.test.ts";
  assert.deepEqual(findSkippedTests([{
    path,
    addedLines: [
      { line: 5, text: 'test("example", { skip: true }, () => {});' },
      { line: 6, text: 'it("example", { "todo": "reason" }, () => {});' },
      { line: 9, text: "  skip: isUnavailable," },
      { line: 12, text: 'test("example", { only: true }, () => {});' },
      { line: 18, text: 'test.skip("example", { todo: true }, () => {});' },
    ],
  }]), {
    ok: false,
    findings: [
      { path, line: 5, kind: "skip" },
      { path, line: 6, kind: "todo" },
      { path, line: 9, kind: "skip" },
      { path, line: 12, kind: "only" },
      { path, line: 18, kind: "skip" },
      { path, line: 18, kind: "todo" },
    ],
  });
});

test("ignores test titles, assertion messages, and comments with directive text", () => {
  const path = "test/plain.test.ts";
  assert.deepEqual(findSkippedTests([{
    path,
    addedLines: [
      { line: 1, text: 'test("keeps skipped records", () => {});' },
      { line: 2, text: 'assert.equal(count, 1, "nothing is skipped");' },
      { line: 3, text: 'test("shows test.skip( and { todo: true }", () => {});' },
      { line: 4, text: 'assert.ok(value, "use \\"quotes\\" around t.todo(");' },
      { line: 5, text: 'assert.ok(value, `example test.only(`); // it.skip("example");' },
      { line: 6, text: '  // test.skip("example");' },
      { line: 7, text: '  /* test.todo("example"); */' },
      { line: 8, text: "  /*" },
      { line: 9, text: '  test.only("example");' },
      { line: 10, text: '  */ test.skip("example");' },
    ],
  }]), { ok: false, findings: [{ path, line: 10, kind: "skip" }] });
});

test("finds runner flags only in the two runner files", () => {
  assert.deepEqual(findSkippedTests([
    { path: "src/example.test.ts", addedLines: [{ line: 6, text: 'test.skip("example");' }] },
    { path: "scripts/check.mjs", addedLines: [{ line: 4, text: 'args.push("--test-only");' }] },
    { path: "package.json", addedLines: [
      { line: 4, text: '"test": "node --test --test-only",' },
      { line: 5, text: '"example": "node --test --test-only-suffix",' },
    ] },
    { path: "scripts/test.mjs", addedLines: [
      { line: 11, text: 'const args = ["--test", "--test-skip-pattern=example"];' },
      { line: 12, text: 'args.push("--test-skip-pattern", "other");' },
      { line: 13, text: '// args.push("--test-only");' },
    ] },
    { path: "test/flags.test.ts", addedLines: [{ line: 3, text: 'assert.equal(flag, "--test-only");' }] },
  ]), {
    ok: false,
    findings: [
      { path: "package.json", line: 4, kind: "only" },
      { path: "scripts/test.mjs", line: 11, kind: "skip" },
      { path: "scripts/test.mjs", line: 12, kind: "skip" },
    ],
  });
});

test("ignores empty and malformed input", () => {
  for (const input of [undefined, null, true, {}, "test", [], [
    null,
    { path: "test/example.test.ts" },
    { path: 42, addedLines: [] },
    { path: "test/example.test.ts", addedLines: "test.skip(" },
    { path: "test/example.test.ts", addedLines: [
      null,
      { line: "2", text: "test.skip(" },
      { line: 0, text: "test.skip(" },
      { line: 1.5, text: "test.skip(" },
      { line: 6, text: 123 },
    ] },
  ]]) {
    assert.deepEqual(findSkippedTests(input), { ok: true, findings: [] });
  }
});

test("still reports valid lines in otherwise malformed input", () => {
  const path = "test/mixed.test.ts";
  assert.deepEqual(findSkippedTests([
    null,
    { path, addedLines: [undefined, { line: 2, text: 't.skip("reason");' }] },
  ]), { ok: false, findings: [{ path, line: 2, kind: "skip" }] });
});
