import assert from "node:assert/strict";
import test from "node:test";
import { unfinishedWorkCheck } from "../src/pomelo/unfinished-guard.js";

const path = "src/pomelo/x.ts";
const unfinishedLines = [
  { line: 2, text: "// TODO: finish" },
  { line: 3, text: "run(); // FIXME: handle the result" },
  { line: 4, text: "/* XXX: revisit the result */" },
  { line: 5, text: " * HACK: replace the fallback" },
  { line: 6, text: 'throw new Error("not implemented");' },
  { line: 7, text: "if (ready) throw new Error('NoT ImPlEmEnTeD');" },
  { line: 8, text: 'throw new Error("This is UNIMPLEMENTED");' },
  { line: 9, text: "throw new Error(`Temporary stub`);" },
  { line: 10, text: "// Temporary placeholder for the result" },
  { line: 11, text: "/* implement later */" },
];

test("reports unfinished comments and stub throws by line without including source text", () => {
  const result = unfinishedWorkCheck(unfinishedLines.map((line) => ({ path, ...line })));

  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path, line, reason }) => ({ path, line, reason })), [
    { path, line: 2, reason: "todo-marker" },
    { path, line: 3, reason: "todo-marker" },
    { path, line: 4, reason: "todo-marker" },
    { path, line: 5, reason: "todo-marker" },
    { path, line: 6, reason: "not-implemented" },
    { path, line: 7, reason: "not-implemented" },
    { path, line: 8, reason: "not-implemented" },
    { path, line: 9, reason: "not-implemented" },
    { path, line: 10, reason: "placeholder" },
    { path, line: 11, reason: "placeholder" },
  ]);
  for (const { message } of result.problems) {
    assert.ok(message.length > 0);
    for (const { text } of unfinishedLines) assert.ok(!message.includes(text));
    assert.ok(!message.includes("handle the result"));
  }
});

test("ignores Friday, lookalike directories, and Pomelo test files", () => {
  const paths = [
    "src/session/core.ts",
    "src/pomelo-extra/x.ts",
    "src/client/pomelo-extra/x.ts",
    "test/pomelo-x.test.ts",
    "src/pomelo/x.test.ts",
    "src/client/pomelo/__tests__/x.tsx",
    "src/pomelo/tests/fixture.ts",
  ];
  const added = paths.flatMap((path) => unfinishedLines.map((line) => ({ path, ...line })));

  assert.deepEqual(unfinishedWorkCheck(added), { ok: true, problems: [] });
});

test("ignores identifiers, quoted text, examples inside comments, and other errors", () => {
  const lines = [
    "const todoist = createWidget(); // The todoist widget",
    'const label = "TODO / placeholder";',
    'const label = "// TODO: finish";',
    "const label = '/* FIXME: check */';",
    "const label = `// HACK: example`;",
    'const example = "throw new Error(\\"not implemented\\");";',
    '// Example: throw new Error("not implemented");',
    '/* Example: throw new Error("stub"); */',
    'throw new Error("Request timed out");',
    'throw new TypeError("not implemented");',
    'new Error("not implemented");',
    "/* Note */ const placeholder = 'value';",
  ];

  assert.deepEqual(unfinishedWorkCheck(lines.map((text, line) => ({ path, line: line + 1, text }))), {
    ok: true,
    problems: [],
  });
  assert.deepEqual(unfinishedWorkCheck([]), { ok: true, problems: [] });
});

test("normalizes separators and sorts findings by path and numeric line", () => {
  const clientPath = "src/client/pomelo/widget.tsx";
  const result = unfinishedWorkCheck([
    { path, line: 1, text: "// TODO: finish the handler" },
    { path: "src\\client\\pomelo\\widget.tsx", line: 12, text: "/* note */ run(); // FIXME: check the result" },
    { path: clientPath, line: 2, text: 'const url = "https://example.invalid/"; // HACK: use a fallback' },
  ]);

  assert.deepEqual(result.problems.map(({ path, line, reason }) => ({ path, line, reason })), [
    { path: clientPath, line: 2, reason: "todo-marker" },
    { path: clientPath, line: 12, reason: "todo-marker" },
    { path, line: 1, reason: "todo-marker" },
  ]);
});
