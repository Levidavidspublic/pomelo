import { test } from "node:test";
import assert from "node:assert/strict";
import { findAlwaysTrueChecks, type AlwaysTrueTestFile } from "../src/pomelo/always-true-tests.js";

const path = "test/pomelo-example.test.ts";

function check(method: string, args: string): string {
  return ["assert", method ? `.${method}` : "", "(", args, ");"].join("");
}

function addedTest(path: string, firstLine: number, ...lines: string[]): AlwaysTrueTestFile {
  return { path, addedLines: lines.map((text, offset) => ({ line: firstLine + offset, text })) };
}

test("names each always-true assertion without including the added text", () => {
  const file = addedTest(path, 10,
    check("ok", "true"),
    check("", "true"),
    check("ok", "1"),
    check("ok", '"some text", "message"'),
    check("ok", "{ value: 0 }"),
    check("ok", "[]"),
    check("equal", "1, 1"),
    check("strictEqual", '"a,b)", "a,b)", "message"'),
    check("deepEqual", "x.y, x.y"),
    check("deepStrictEqual", "items[index(1, 2)], items[index(1, 2)]"),
    check("equal", "a, a"),
    check("notEqual", "1, 2"),
    check("notEqual", '"//", "/*"'),
    check("doesNotThrow", '() => { /* empty */ }, "message"'),
    check("ok", "(0x10n)"),
    check("ok", "/[)]/"),
  );

  assert.deepEqual(findAlwaysTrueChecks([file]), [
    { path, line: 10, reason: "truthy-literal" },
    { path, line: 11, reason: "truthy-literal" },
    { path, line: 12, reason: "truthy-literal" },
    { path, line: 13, reason: "truthy-literal" },
    { path, line: 14, reason: "truthy-literal" },
    { path, line: 15, reason: "truthy-literal" },
    { path, line: 16, reason: "identical-operands" },
    { path, line: 17, reason: "identical-operands" },
    { path, line: 18, reason: "identical-operands" },
    { path, line: 19, reason: "identical-operands" },
    { path, line: 20, reason: "identical-operands" },
    { path, line: 21, reason: "different-literals" },
    { path, line: 22, reason: "different-literals" },
    { path, line: 23, reason: "empty-callback" },
    { path, line: 24, reason: "truthy-literal" },
    { path, line: 25, reason: "truthy-literal" },
  ]);
});

test("accepts real checks and leaves failing constant assertions to the test runner", () => {
  const file = addedTest(path, 1,
    check("equal", 'result.status, "ok"'),
    check("equal", "a, b"),
    check("ok", "[value].length === 0"),
    check("ok", "false"),
    check("ok", "-0"),
    check("ok", '""'),
    check("ok", "`${value}`"),
    check("strictEqual", "0, -0"),
    check("notEqual", "1, 1.0"),
    check("notEqual", '"a", \'a\''),
    check("notEqual", String.raw`"a", "\x61"`),
    check("notEqual", "1, result.count"),
    check("equal", "...args, ...args"),
    check("doesNotThrow", "() => { run(); }"),
    `other . ${check("ok", "true")}`,
    `custom_${check("ok", "true")}`,
    ["assert", ".equal(a, a"].join(""),
  );

  assert.deepEqual(findAlwaysTrueChecks([file]), []);
});

test("ignores assertions in comments and strings and resumes when they close", () => {
  const sample = check("ok", "true");
  const file = addedTest(path, 3,
    `// ${sample}`,
    `/* ${sample} */`,
    "/*",
    `  ${sample}`,
    `*/ ${sample}`,
    `const double = "\\\"${sample}";`,
    `const single = '${sample}';`,
    `const template = \`${sample}\`;`,
    "const multiline = `open",
    `  ${sample}`,
    `close\`; ${sample}`,
    `${sample} ${sample}`,
    `log("//"); ${sample}`,
    `log(/${sample}/);`,
    ` * ${sample}`,
    `const nested = \`outer \${\`${sample}\`}\`;`,
    `const interpolated = \`outer \${{ part: "}" }.part}\`; ${sample}`,
  );

  assert.deepEqual(findAlwaysTrueChecks([file]), [
    { path, line: 7, reason: "truthy-literal" },
    { path, line: 13, reason: "truthy-literal" },
    { path, line: 14, reason: "truthy-literal" },
    { path, line: 15, reason: "truthy-literal" },
    { path, line: 19, reason: "truthy-literal" },
  ]);
});

test("checks only Pomelo test files and sorts findings by path and line", () => {
  const sample = check("ok", "true");
  const first = "test/pomelo-a.test.ts";
  const last = "test/pomelo-z.test.ts";
  const files = [
    addedTest(last, 1, sample),
    { path: first, addedLines: [{ line: 12, text: sample }, { line: 2, text: sample }] },
    addedTest("test/baseline.test.ts", 1, sample),
    addedTest("src/pomelo/pomelo-example.test.ts", 1, sample),
    addedTest("test/fixtures/pomelo-example.test.ts", 1, sample),
    addedTest("test/pomelo-example.ts", 1, sample),
  ];

  assert.deepEqual(findAlwaysTrueChecks(files), [
    { path: first, line: 2, reason: "truthy-literal" },
    { path: first, line: 12, reason: "truthy-literal" },
    { path: last, line: 1, reason: "truthy-literal" },
  ]);
  assert.deepEqual(files[1].addedLines.map(({ line }) => line), [12, 2]);
});

test("ignores malformed input without throwing", () => {
  const sample = check("ok", "true");
  for (const input of [undefined, null, true, "test", {}, [], [
    null,
    { path },
    { path, addedLines: {} },
    { addedLines: [] },
    { path, addedLines: [
      null,
      { line: 1 },
      { text: sample },
      { line: -1, text: sample },
      { line: 1.5, text: sample },
    ] },
  ]]) {
    assert.deepEqual(findAlwaysTrueChecks(input), []);
  }
});
