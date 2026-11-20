import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "../src/client/pomelo/version-compare.js";

const options = { kind: "html", maxLines: 100 } as const;

test("equal bodies have no changes and number the same lines on both sides", () => {
  assert.deepEqual(compareVersions("first\nsecond", "first\nsecond", options), {
    status: "ready",
    rows: [
      { type: "same", content: "first", oldLine: 1, newLine: 1 },
      { type: "same", content: "second", oldLine: 2, newLine: 2 },
    ],
    added: 0,
    removed: 0,
    summary: "No changes",
  });
});

test("an added line shifts only the new line numbers", () => {
  assert.deepEqual(compareVersions("first\nlast", "first\ninserted\nlast", options), {
    status: "ready",
    rows: [
      { type: "same", content: "first", oldLine: 1, newLine: 1 },
      { type: "added", content: "inserted", newLine: 2 },
      { type: "same", content: "last", oldLine: 2, newLine: 3 },
    ],
    added: 1,
    removed: 0,
    summary: "1 line added, 0 removed",
  });
});

test("a removed line shifts only the old line numbers", () => {
  assert.deepEqual(compareVersions("first\ndeleted\nlast", "first\nlast", options), {
    status: "ready",
    rows: [
      { type: "same", content: "first", oldLine: 1, newLine: 1 },
      { type: "removed", content: "deleted", oldLine: 2 },
      { type: "same", content: "last", oldLine: 3, newLine: 2 },
    ],
    added: 0,
    removed: 1,
    summary: "0 lines added, 1 removed",
  });
});

test("a replacement removes the old line and adds the new one", () => {
  assert.deepEqual(compareVersions("before", "after", options), {
    status: "ready",
    rows: [
      { type: "removed", content: "before", oldLine: 1 },
      { type: "added", content: "after", newLine: 1 },
    ],
    added: 1,
    removed: 1,
    summary: "1 line added, 1 removed",
  });
});

test("CRLF, LF and lone CR line endings compare alike", () => {
  const lf = compareVersions("first\nsecond\n", "first\nsecond\n", options);

  assert.deepEqual(compareVersions("first\r\nsecond\r\n", "first\nsecond\n", options), lf);
  assert.deepEqual(compareVersions("first\rsecond\r", "first\nsecond\n", options), lf);
  assert.equal(lf.status, "ready");
  assert.equal(lf.summary, "No changes");
  assert.equal(lf.rows.length, 2);
});

test("a long unchanged run folds into one row with three lines of context beside each change", () => {
  const shared = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`);
  const result = compareVersions(
    [...shared, "before"].join("\n"),
    ["inserted", ...shared, "after"].join("\n"),
    options,
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(result.rows, [
    { type: "added", content: "inserted", newLine: 1 },
    { type: "same", content: "line 1", oldLine: 1, newLine: 2 },
    { type: "same", content: "line 2", oldLine: 2, newLine: 3 },
    { type: "same", content: "line 3", oldLine: 3, newLine: 4 },
    { type: "fold", content: "6 unchanged lines", count: 6, oldLine: 4, newLine: 5 },
    { type: "same", content: "line 10", oldLine: 10, newLine: 11 },
    { type: "same", content: "line 11", oldLine: 11, newLine: 12 },
    { type: "same", content: "line 12", oldLine: 12, newLine: 13 },
    { type: "removed", content: "before", oldLine: 13 },
    { type: "added", content: "after", newLine: 14 },
  ]);
  assert.equal(result.summary, "2 lines added, 1 removed");
});

test("Hebrew is preserved in rows and the summary contains only counts", () => {
  const result = compareVersions("שלום\nיום טוב", "שלום\nלילה טוב", { ...options, kind: "mermaid" });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.rows, [
    { type: "same", content: "שלום", oldLine: 1, newLine: 1 },
    { type: "removed", content: "יום טוב", oldLine: 2 },
    { type: "added", content: "לילה טוב", newLine: 2 },
  ]);
  assert.equal(result.summary, "1 line added, 1 removed");
});

test("either body over the caller's line cap returns a reason and no rows", () => {
  const capped = { ...options, maxLines: 2 };
  const twoLines = "one\r\ntwo\r\n";
  const threeLines = `${twoLines}three`;
  const fallback = { status: "fallback", reason: "This artifact is too large to compare.", rows: [] };

  assert.equal(compareVersions(twoLines, twoLines, capped).status, "ready");
  assert.deepEqual(compareVersions(threeLines, twoLines, capped), fallback);
  assert.deepEqual(compareVersions(twoLines, threeLines, capped), fallback);
});

test("oversized single lines and permissive line caps still return a fallback", () => {
  const largeLine = "x".repeat(256 * 1024 + 1);
  const manyLines = "x\n".repeat(1001);
  const fallback = { status: "fallback", reason: "This artifact is too large to compare.", rows: [] };

  assert.deepEqual(compareVersions(largeLine, "x", options), fallback);
  assert.deepEqual(compareVersions("x", largeLine, options), fallback);
  assert.deepEqual(compareVersions(manyLines, manyLines, { ...options, maxLines: 10_000 }), fallback);
});

test("images return a plain reason and no rows", () => {
  assert.deepEqual(compareVersions("image one", "image two", { ...options, kind: "image" }), {
    status: "fallback",
    reason: "Images cannot be compared line by line.",
    rows: [],
  });
});

test("an empty old body adds every line, including a real blank line", () => {
  assert.deepEqual(compareVersions("", "first\n\nlast\n", options), {
    status: "ready",
    rows: [
      { type: "added", content: "first", newLine: 1 },
      { type: "added", content: "", newLine: 2 },
      { type: "added", content: "last", newLine: 3 },
    ],
    added: 3,
    removed: 0,
    summary: "3 lines added, 0 removed",
  });
});

test("the comparison keeps the longest subsequence of lines in order", () => {
  const result = compareVersions("moved\nfirst\nsecond", "first\nsecond\nmoved", options);

  assert.equal(result.status, "ready");
  assert.deepEqual(result.rows, [
    { type: "removed", content: "moved", oldLine: 1 },
    { type: "same", content: "first", oldLine: 2, newLine: 1 },
    { type: "same", content: "second", oldLine: 3, newLine: 2 },
    { type: "added", content: "moved", newLine: 3 },
  ]);
});
