import { test } from "node:test";
import assert from "node:assert/strict";
import { testTitleFindings } from "../src/pomelo/test-titles.js";

function changedFile(path: string, lines: string[], added = lines.map((_, index) => index + 1)) {
  return {
    path,
    fullText: lines.join("\n"),
    addedLines: added.map((line) => ({ line, text: lines[line - 1] })),
  };
}

test("reports both added calls with the same title in one file", () => {
  const file = changedFile("test/pomelo-example.test.ts", [
    'test("same", run);',
    'test("same", run);',
  ], [2, 1]);
  assert.deepEqual(testTitleFindings([file]), {
    ok: true,
    findings: [
      { file: file.path, line: 1, kind: "repeated", message: 'Test title "same" is repeated on line 1.' },
      { file: file.path, line: 2, kind: "repeated", message: 'Test title "same" is repeated on line 2.' },
    ],
  });
});

test("allows the same title in separate files and describe blocks", () => {
  const first = changedFile("test/pomelo-first.test.ts", [
    'test("same", run);',
    'describe("outer", () => {',
    '  if (ready) { test("same", run); }',
    '  describe("nested", () => { test("same", run); });',
    '});',
    'describe("sibling", { timeout: 100 }, (function () { test("same", run); }),);',
  ]);
  const second = changedFile("test/pomelo-second.test.ts", ['test("same", run);']);
  assert.deepEqual(testTitleFindings([first, second]), { ok: true, findings: [] });
});

test("reports empty and runtime-built titles in each supported call form", () => {
  const file = changedFile("test/pomelo-example.test.ts", [
    'test("", run);',
    "it('  ', run);",
    'test.skip("\\t", run);',
    'test.only(name, run);',
    'test.todo(`case ${name}`);',
    'it.skip("case " + name, run);',
    'it.only(`case ${make({ part: `nested ${name}` })}`, run);',
    'it.todo(buildName("case", name));',
    'test(`plain template`, run);',
    'test(`literal \\${name}`, run);',
  ]);
  const result = testTitleFindings([file]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.findings.map(({ line, kind }) => [line, kind]), [
    [1, "empty"], [2, "empty"], [3, "empty"], [4, "dynamic"],
    [5, "dynamic"], [6, "dynamic"], [7, "dynamic"], [8, "dynamic"],
  ]);
  assert.ok(result.findings.every(({ file: path, line, message }) =>
    path === file.path && message.endsWith(` on line ${line}.`)));
});

test("uses full text to ignore comments, strings, and unrelated members", () => {
  const file = changedFile("test/pomelo-example.test.ts", [
    '/* start of an unchanged block comment',
    'test("", run);',
    '*/',
    'const example = `sample',
    'it(name, run);',
    '`;',
    '// test(name, run);',
    'const snippet = \'test("", run);\';',
    'const pattern = /test[(]name, run[)]/;',
    'other.test("", run);',
    'function test(title: string) { return title; }',
    'const methods = { it(title: string) { return title; } };',
    'test("real", run);',
    'const raw = String.raw\x60test("", run); \\x\x60;',
  ], [2, 5, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(testTitleFindings([file]), { ok: true, findings: [] });
});

test("reports only added call lines and checks their titles against older calls", () => {
  const file = changedFile("test/pomelo-example.test.ts", [
    'describe("suite", () => {',
    '  test("same", run);',
    '  test("", run);',
    '  if (ready) {',
    '    it(',
    '      `same`,',
    '      run,',
    '    );',
    '  }',
    '});',
  ], [5]);
  assert.deepEqual(testTitleFindings([file]), {
    ok: true,
    findings: [
      { file: file.path, line: 5, kind: "repeated", message: 'Test title "same" is repeated on line 5.' },
    ],
  });
});

test("sorts by file and line, and clips only the displayed title", () => {
  const longTitle = "a".repeat(65);
  const first = changedFile("test/pomelo-a.test.ts", [
    `test("${longTitle}", run);`,
    `it("${longTitle.slice(0, 60)}different", run);`,
    `it(("\\x61${longTitle.slice(1)}"), run);`,
  ], [3, 2, 1]);
  const last = changedFile("test/pomelo-z.test.ts", ['it("", run);']);
  const result = testTitleFindings([last, first]);
  assert.deepEqual(result, {
    ok: true,
    findings: [
      { file: first.path, line: 1, kind: "repeated", message: `Test title "${longTitle.slice(0, 60)}" is repeated on line 1.` },
      { file: first.path, line: 3, kind: "repeated", message: `Test title "${longTitle.slice(0, 60)}" is repeated on line 3.` },
      { file: last.path, line: 1, kind: "empty", message: "Test title is empty on line 1." },
    ],
  });
});

test("ignores files outside the top-level Pomelo test pattern", () => {
  const paths = [
    "test/lanes.test.ts", "src/pomelo-example.test.ts", "test/nested/pomelo-example.test.ts",
    "test/pomelo-example.test.ts.bak",
  ];
  assert.deepEqual(testTitleFindings(paths.map((path) => changedFile(path, ['test("", run);']))),
    { ok: true, findings: [] });
});

test("refuses malformed inputs and inconsistent added lines", () => {
  const file = changedFile("test/pomelo-example.test.ts", ['test("", run);']);
  for (const input of [
    null, {}, [null], [{ ...file, fullText: undefined }], [{ ...file, addedLines: "broken" }],
    [{ ...file, addedLines: [{ line: 0, text: file.fullText }] }],
    [{ ...file, addedLines: [{ line: 2, text: file.fullText }] }],
    [{ ...file, addedLines: [{ line: 1, text: "different" }] }],
    [{ ...file, fullText: file.fullText + "\n", addedLines: [{ line: 2, text: "" }] }],
    [file, changedFile(file.path, ['test("unterminated);'])],
    [changedFile(file.path, ['test("", run'])],
  ]) {
    const result = testTitleFindings(input);
    assert.equal(result.ok, false);
    assert.ok("reason" in result && result.reason.length > 0);
  }
});
