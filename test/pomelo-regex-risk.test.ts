import assert from "node:assert/strict";
import test from "node:test";
import { slowPatternLines } from "../src/pomelo/regex-risk.js";

const serverPath = "src/pomelo/stop-rules.ts";
const clientPath = "src/client/pomelo/browser/stop-rules.ts";
const nestedRepeat = ["(a+", ")+"].join("");
const riskyPatterns = [
  [nestedRepeat, "nested-repeat"],
  [["(\\w*", ")*"].join(""), "nested-repeat"],
  [["(.*", ")*x"].join(""), "nested-repeat"],
  [["(?:\\s*\\w+\\s*", ")*$"].join(""), "nested-repeat"],
  [[".*", ".*="].join(""), "double-wildcard"],
  [["(a+?", "){2,}?"].join(""), "nested-repeat"],
  [[".*?", ".+"].join(""), "double-wildcard"],
] as const;

test("reports risky literals and constructor strings at their added lines", () => {
  const added = riskyPatterns.flatMap(([pattern], index) => [
    { path: serverPath, line: index + 1, text: "const rule = /" + pattern + "/i;" },
    { path: clientPath, line: index + 1, text: "const rule = new RegExp(" + JSON.stringify(pattern) + ", 'i');" },
  ]);

  const expected = riskyPatterns.flatMap(([, kind], index) => [
    { path: serverPath, line: index + 1, kind },
    { path: clientPath, line: index + 1, kind },
  ]);
  assert.deepEqual(slowPatternLines(added).map(({ path, line, kind }) => ({ path, line, kind })), expected);
});

test("ignores bounded, separated, escaped, and character-class repeats", () => {
  const patterns = [
    "(ab)+", "a+b+", "[^,]*,", "(a+){1,3}", "(a+)?", "(a+b)*",
    "\\(a+\\)+", "(a\\+)+", String.raw`\.*.\*`, "[.*]*", ".*x.*", ".*.{1,3}", "[[]", "[/]",
  ];
  const added = patterns.flatMap((pattern, index) => [
    { path: serverPath, line: index * 2 + 1, text: "const rule = /" + pattern + "/;" },
    { path: serverPath, line: index * 2 + 2, text: "new RegExp(" + JSON.stringify(pattern) + ");" },
  ]);

  assert.deepEqual(slowPatternLines(added), []);
});

test("ignores comments, unrelated strings, division, and dynamic constructor arguments", () => {
  const added = [
    "// const rule = /" + nestedRepeat + "/;",
    "/* const rule = /" + nestedRepeat + "/;",
    "new RegExp('" + nestedRepeat + "');",
    "*/ const rule = /safe/; // new RegExp('" + nestedRepeat + "');",
    "const example = " + JSON.stringify("new RegExp('" + nestedRepeat + "');"),
    "const example = '" + "/" + nestedRepeat + "/" + "';",
    "const ratio = total / (a + b) / scale;",
    "new RegExp('" + nestedRepeat + "'.replaceAll('+', ''));",
    "new RegExp(prefix + '" + nestedRepeat + "');",
  ].map((text, index) => ({ path: serverPath, line: index + 1, text }));

  assert.deepEqual(slowPatternLines(added), []);
});

test("finds a regex after division and preserves comment delimiters inside literals", () => {
  const added = [
    "const ratio = total / /" + nestedRepeat + "/.source.length;",
    "const rule = /[//]" + nestedRepeat + "/;",
    "const rule = /* note */ new RegExp /* note */ ('" + nestedRepeat + "');",
    "const rule = new RegExp('\\x28a+\\x29' + suffix);",
    "const rule = new RegExp('\\x28a+\\x29+');",
    "if (ready) /" + nestedRepeat + "/.test(pageText);",
  ].map((text, index) => ({ path: serverPath, line: index + 1, text }));

  assert.deepEqual(slowPatternLines(added).map(({ line }) => line), [1, 2, 3, 5, 6]);
});

test("ignores test and non-Pomelo paths and malformed input", () => {
  const text = "const rule = /" + nestedRepeat + "/;";
  const ignoredPaths = [
    "test/worker.test.ts", "src/runner/worker.ts", "src/pomelo-extra/worker.ts",
    "src/pomelo/worker.test.ts", "src/client/pomelo/worker.spec.tsx", "src/pomelo/__tests__/worker.ts",
  ];

  assert.deepEqual(slowPatternLines({ path: serverPath, line: 1, text }), []);
  assert.deepEqual(slowPatternLines([
    ...ignoredPaths.map((path) => ({ path, line: 1, text })),
    null, { path: serverPath, text }, { path: serverPath, line: 0, text },
    { path: serverPath, line: 1, text: 42 },
  ]), []);
});

test("reports one finding per line with a fixed reason and no source text", () => {
  const pattern = ["(exampleMarker+", ")+"].join("");
  const text = "const rule = /" + pattern + "/; const other = /" + nestedRepeat + "/;";
  const [finding, duplicate] = slowPatternLines([{ path: serverPath, line: 8, text }]);

  assert.equal(duplicate, undefined);
  assert.deepEqual(finding, {
    path: serverPath,
    line: 8,
    kind: "nested-repeat",
    reason: "An unbounded group ends with an unbounded repeat.",
  });
  assert.ok(!JSON.stringify(finding).includes(pattern));
  assert.ok(!JSON.stringify(finding).includes(text));
  const [other] = slowPatternLines([{ path: serverPath, line: 9, text: "new RegExp('" + nestedRepeat + "');" }]);
  assert.equal(other.reason, finding.reason);
  const [wildcards] = slowPatternLines([{ path: serverPath, line: 10, text: "const rule = /" + [".*", ".*"].join("") + "/;" }]);
  assert.equal(wildcards.reason, "Two adjacent wildcards have unbounded repeats.");
});
