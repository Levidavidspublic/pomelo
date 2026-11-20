import assert from "node:assert/strict";
import test from "node:test";
import { findHiddenChars } from "../src/pomelo/hidden-chars.js";

const path = "src/example.ts";

test("ordinary text is clean, including Hebrew, mixed Hebrew and English, and Arabic", () => {
  assert.deepEqual(findHiddenChars([{
    path,
    addedLines: [
      { line: 1, text: "const greeting = 'hello';" },
      { line: 2, text: "שלום לכולם" },
      { line: 3, text: "Hello, שלום לכולם!" },
      { line: 4, text: "مرحبا بالعالم" },
    ],
  }]), []);
});

test("reports a bidi override with its exact location and code point", () => {
  const override = String.fromCodePoint(0x202e);
  assert.deepEqual(findHiddenChars([{
    path,
    addedLines: [{ line: 12, text: `// ${override}example` }],
  }]), [{ path, line: 12, column: 4, codePoint: "U+202E" }]);
});

test("reports the other bidi controls and zero-width characters in Markdown", () => {
  const markdown = "README.md";
  const points = [0x202a, 0x202b, 0x202c, 0x202d, 0x2066, 0x2067, 0x2068, 0x2069, 0x200b, 0x200c, 0x200d, 0x2060];
  assert.deepEqual(findHiddenChars([{
    path: markdown,
    addedLines: [{ line: 2, text: String.fromCodePoint(...points) }],
  }]), points.map((point, index) => ({
    path: markdown, line: 2, column: index + 1, codePoint: `U+${point.toString(16).toUpperCase()}`,
  })));
});

test("reports a zero-width space inside an identifier", () => {
  const space = String.fromCodePoint(0x200b);
  assert.deepEqual(findHiddenChars([{
    path,
    addedLines: [{ line: 5, text: `const user${space}Name = '';` }],
  }]), [{ path, line: 5, column: 11, codePoint: "U+200B" }]);
});

test("allows a BOM only at the start of a file", () => {
  const bom = String.fromCodePoint(0xfeff);
  assert.deepEqual(findHiddenChars([{
    path,
    addedLines: [
      { line: 1, text: `${bom}${bom}first` },
      { line: 2, text: `${bom}second` },
      { line: 3, text: `third${bom}` },
    ],
  }]), [
    { path, line: 1, column: 2, codePoint: "U+FEFF" },
    { path, line: 2, column: 1, codePoint: "U+FEFF" },
    { path, line: 3, column: 6, codePoint: "U+FEFF" },
  ]);
});

test("flags direction marks in code and allows them in Markdown", () => {
  const codePaths = [path, "src/view.tsx", "scripts/check.mjs", "scripts/check.cjs", "settings.json"];
  const addedLines = [{ line: 7, text: `${String.fromCodePoint(0x200e, 0x200f)}שלום` }];
  assert.deepEqual(findHiddenChars([
    ...codePaths.map((path) => ({ path, addedLines })),
    { path: "docs/example.md", addedLines },
  ]), codePaths.flatMap((path) => [
    { path, line: 7, column: 1, codePoint: "U+200E" },
    { path, line: 7, column: 2, codePoint: "U+200F" },
  ]));
});

test("reports both format characters without line text and counts Unicode code points as columns", () => {
  const text = `😀${String.fromCodePoint(0x00ad)}a${String.fromCodePoint(0xe0061)}b`;
  assert.deepEqual(findHiddenChars([{
    path,
    addedLines: [{ line: 9, text }],
  }]), [
    { path, line: 9, column: 2, codePoint: "U+00AD" },
    { path, line: 9, column: 4, codePoint: "U+E0061" },
  ]);
});

test("malformed input returns no findings without throwing", () => {
  const text = String.fromCodePoint(0x202e);
  for (const input of [
    undefined,
    null,
    { path, addedLines: [] },
    [null],
    [{ path: 42, addedLines: [] }],
    [{ path, addedLines: "bad" }],
    [{ path, addedLines: [null] }],
    [{ path, addedLines: [{ line: 0, text }] }],
    [{ path, addedLines: [{ line: 1.5, text }] }],
    [{ path, addedLines: [{ line: 1, text }, { line: 2, text: 42 }] }],
    [{ path, get addedLines() { throw new Error("unreadable"); } }],
  ]) {
    assert.deepEqual(findHiddenChars(input), []);
  }
});
