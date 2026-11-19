import assert from "node:assert/strict";
import test from "node:test";
import { findTypeEscapes } from "../src/pomelo/type-escapes.js";

const directive = "@ts-";
const cast = "as " + "any";
const annotation = ": " + "any";
const generic = "<" + "any>";
const array = "any" + "[]";
const doubleCast = "as unknown " + "as";

test("reports all rules by path, line number and rule", () => {
  const source = "src/pomelo/example.ts";
  const client = "src/client/pomelo/feature/example.tsx";
  const spec = "test/pomelo-example.test.ts";

  assert.deepEqual(findTypeEscapes([
    { path: spec, addedLines: [{ line: 1, text: `/* ${directive}expect-error */` }] },
    { path: source, addedLines: [
      { line: 11, text: `// ${directive}ignore` },
      { line: 4, text: `// ${directive}nocheck` },
      { line: 13, text: `const value = input ${doubleCast} Result;` },
      { line: 5, text: `const value${annotation} = input ${cast};` },
      { line: 12, text: `const values = input ${"as " + array};` },
    ] },
    { path: client.replaceAll("/", "\\"), addedLines: [
      { line: 3, text: `const value = load${generic}();` },
      { line: 2, text: `// ${directive}expect-error: --` },
    ] },
  ]), [
    { path: client, line: 2, rule: "ts-expect-error-bare" },
    { path: client, line: 3, rule: "any-annotation" },
    { path: source, line: 4, rule: "ts-nocheck" },
    { path: source, line: 5, rule: "any-annotation" },
    { path: source, line: 5, rule: "as-any" },
    { path: source, line: 11, rule: "ts-ignore" },
    { path: source, line: 12, rule: "any-annotation" },
    { path: source, line: 12, rule: "as-any" },
    { path: source, line: 13, rule: "double-cast" },
    { path: spec, line: 1, rule: "ts-expect-error-bare" },
  ]);
});

test("ignores paths outside Pomelo source and top-level Pomelo tests", () => {
  const addedLines = [{ line: 1, text: `// ${directive}nocheck` }];

  assert.deepEqual(findTypeEscapes([
    { path: "src/runner/adapters.ts", addedLines },
    { path: "src/client/pomelo-old/example.ts", addedLines },
    { path: "test/example.test.ts", addedLines },
    { path: "test/pomelo-example/child.test.ts", addedLines },
    { path: "test/pomelo-example.ts", addedLines },
  ]), []);
});

test("ignores quoted examples, regular expressions and documented suppressions", () => {
  const text = [
    `const single = 'it\\'s ${cast}';`,
    `const double = "example: // ${directive}ignore";`,
    `const template = \`example: ${annotation}\`;`,
    `const pattern = /["/]${cast}|${directive}nocheck/g;`,
    `// Example of a cast: ${cast}`,
    `// ${directive}expect-error -- this fixture intentionally passes the wrong type`,
    `/* ${directive}expect-error: this fixture passes the wrong type */`,
    "const value: anything = input as anyValue;",
  ];

  assert.deepEqual(findTypeEscapes([{
    path: "test/pomelo-example.test.ts",
    addedLines: text.map((text, index) => ({ line: index + 1, text })),
  }]), []);
});

test("reports a real cast beside a literal and distinguishes division from a regex", () => {
  const path = "src/pomelo/example.ts";

  assert.deepEqual(findTypeEscapes([{ path, addedLines: [
    { line: 1, text: `const value = "${cast}" ${cast};` },
    { line: 2, text: `const ratio = total / (count ${cast}) / 2;` },
    { line: 3, text: `const value = /${cast}/ ${cast};` },
    { line: 4, text: `const values${annotation} = input ${"as " + array};` },
    { line: 5, text: `const value = "//"; // ${directive}ignore` },
  ] }]), [
    { path, line: 1, rule: "as-any" },
    { path, line: 2, rule: "as-any" },
    { path, line: 3, rule: "as-any" },
    { path, line: 4, rule: "any-annotation" },
    { path, line: 4, rule: "as-any" },
    { path, line: 5, rule: "ts-ignore" },
  ]);
});

test("accepts an empty diff", () => {
  assert.deepEqual(findTypeEscapes([]), []);
});
