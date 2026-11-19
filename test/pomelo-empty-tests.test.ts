import { test } from "node:test";
import assert from "node:assert/strict";
import { findEmptyTests, type EmptyTestFile } from "../src/pomelo/empty-tests.js";

function addedTest(path: string, firstLine: number, ...lines: string[]): EmptyTestFile {
  return { path, addedLines: lines.map((text, offset) => ({ line: firstLine + offset, text })) };
}

test("accepts direct, strict, expect, and test-context assertions", () => {
  const file = addedTest("test/real.test.ts", 1,
    'test("direct", () => { assert(result); });',
    'test("strict", () => { assert.strict.equal(result, 1); });',
    'it("expect", () => expect(actual).toBe(expected));',
    'test("context", (t) => { t.assert.equal(actual, expected); });',
    'test("mixed", () => { assert.ok(true); assert.equal(result, 1); });',
    'test("pattern", () => { assert.match(result, /[})]/); });',
  );
  assert.deepEqual(findEmptyTests([file]), { ok: true, findings: [] });
});

test("names empty, comment-only, and assertion-free tests", () => {
  const path = "test/empty.test.ts";
  const file = addedTest(path, 8,
    'test("empty", () => {});',
    'it("comment only", () => {',
    '  // assert.ok(actual); }',
    '  /* expect(actual)',
    '     t.assert.equal(actual, expected); */',
    '});',
    'test("no assert", () => {',
    '  const sample = "assert.ok(actual); }";',
    '  log(`example',
    '       expect(actual).toBe(expected);`);',
    '  // assert.equal(actual, expected);',
    '});',
    'test("string only", () => { "assert(actual)"; });',
    'test("other method", () => { validator.assert(actual); });',
    'test("method definition", () => { register({ assert(value) {} }); });',
    '// test("ignored", () => {});',
    'log("test(ignored, () => {})");',
  );
  assert.deepEqual(findEmptyTests([file]), {
    ok: false,
    findings: [
      { path, line: 8, name: "empty", reason: "empty" },
      { path, line: 9, name: "comment only", reason: "empty" },
      { path, line: 14, name: "no assert", reason: "no-assert" },
      { path, line: 20, name: "string only", reason: "no-assert" },
      { path, line: 21, name: "other method", reason: "no-assert" },
      { path, line: 22, name: "method definition", reason: "no-assert" },
    ],
  });
});

test("reports literal-only assertions and keeps tests that check a value", () => {
  const path = "test/constants.test.ts";
  const file = addedTest(path, 1,
    'test("truth", () => { assert.ok(true); });',
    'test("equality", () => { assert.equal(1, 1); });',
    'it("text", (t) => { t.assert.equal("a,b", "a,b", message); });',
    'it("matcher", () => expect(1).toBe(1));',
    'test("signed numbers", () => assert.strictEqual((-1.5), -1.5));',
    'test("computed", () => { assert.equal(add(0, 1), 1); });',
  );
  assert.deepEqual(findEmptyTests([file]), {
    ok: false,
    findings: [
      { path, line: 1, name: "truth", reason: "constant" },
      { path, line: 2, name: "equality", reason: "constant" },
      { path, line: 3, name: "text", reason: "constant" },
      { path, line: 4, name: "matcher", reason: "constant" },
      { path, line: 5, name: "signed numbers", reason: "constant" },
    ],
  });
});

test("names tests with omitted callbacks or parenthesized empty callbacks", () => {
  const path = "test/callbacks.test.ts";
  const file = addedTest(path, 1,
    'test("no callback");',
    'test("options only", { timeout: 100 });',
    'it("parenthesized", (() => {}));',
    'test("callback reference", checkResult);',
  );
  assert.deepEqual(findEmptyTests([file]), {
    ok: false,
    findings: [
      { path, line: 1, name: "no callback", reason: "empty" },
      { path, line: 2, name: "options only", reason: "empty" },
      { path, line: 3, name: "parenthesized", reason: "empty" },
    ],
  });
});

test("reads multiline callbacks, including nested braces and test options", () => {
  const path = "test/multiline.test.ts";
  const file = addedTest(path, 24,
    'test(',
    '  "checks a nested value",',
    '  { timeout: 100 },',
    '  async function (t) {',
    '    const actual = { value: await getValue() };',
    '    t.assert.equal(',
    '      actual.value,',
    '      expected,',
    '    );',
    '  },',
    ');',
    'it(',
    '  "setup only",',
    '  () => {',
    '    use({ nested: { value: 1 } });',
    '  },',
    ');',
  );
  assert.deepEqual(findEmptyTests([file]), {
    ok: false,
    findings: [{ path, line: 35, name: "setup only", reason: "no-assert" }],
  });
});

test("reports test call lines in path and line order and clips long titles", () => {
  const longName = "a".repeat(85);
  const first = "test/a.test.ts";
  const last = "test/z.test.ts";
  assert.deepEqual(findEmptyTests([
    addedTest(last, 1, 'test("last", () => {});'),
    addedTest(first, 12, `it('${longName}', () => {});`),
    addedTest(first, 4, 'test("first { )", () => (setup()));'),
  ]), {
    ok: false,
    findings: [
      { path: first, line: 4, name: "first { )", reason: "no-assert" },
      { path: first, line: 12, name: longName.slice(0, 80), reason: "empty" },
      { path: last, line: 1, name: "last", reason: "empty" },
    ],
  });
});

test("does not classify partial callbacks across gaps in the added lines", () => {
  const path = "test/partial.test.ts";
  assert.deepEqual(findEmptyTests([{
    path,
    addedLines: [
      { line: 4, text: 'test("existing body", () => {' },
      { line: 9, text: '}); test("added empty", () => {});' },
    ],
  }]), {
    ok: false,
    findings: [{ path, line: 9, name: "added empty", reason: "empty" }],
  });
});

test("ignores non-arrays and rows with missing or invalid fields", () => {
  for (const input of [undefined, null, true, "test", {}, [], [
    null,
    { path: "test/example.test.ts" },
    { addedLines: [] },
    { path: "test/example.test.ts", addedLines: [
      null,
      { line: 1 },
      { text: 'test("missing line", () => {});' },
      { line: -1, text: 'test("invalid line", () => {});' },
    ] },
  ]]) {
    assert.deepEqual(findEmptyTests(input), { ok: true, findings: [] });
  }
});
