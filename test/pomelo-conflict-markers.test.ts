import assert from "node:assert/strict";
import test from "node:test";
import { findConflictMarkers } from "../src/pomelo/conflict-markers.js";

const ours = "<".repeat(7);
const base = "|".repeat(7);
const split = "=".repeat(7);
const theirs = ">".repeat(7);

test("clean added lines give no hits", () => {
  assert.deepEqual(findConflictMarkers([{
    path: "src/example.ts",
    addedLines: [{ line: 1, text: "export {};" }],
  }]), { ok: true, hits: [] });
});

test("all four markers report only their path, line, and kind", () => {
  const path = "src/example.ts";
  assert.deepEqual(findConflictMarkers([{
    path,
    addedLines: [
      { line: 3, text: `${ours} HEAD` },
      { line: 5, text: `${base} common ancestor` },
      { line: 7, text: split },
      { line: 9, text: `${theirs} feature/example` },
    ],
  }]), {
    ok: false,
    hits: [
      { path, line: 3, kind: "ours" },
      { path, line: 5, kind: "base" },
      { path, line: 7, kind: "split" },
      { path, line: 9, kind: "theirs" },
    ],
  });
});

test("a Markdown heading underline on its own is clean", () => {
  assert.deepEqual(findConflictMarkers([{
    path: "README.md",
    addedLines: [{ line: 1, text: "Heading" }, { line: 2, text: split }],
  }]), { ok: true, hits: [] });
});

test("an opening marker makes a split count only in its own file", () => {
  const path = "src/example.ts";
  assert.deepEqual(findConflictMarkers([
    { path: "README.md", addedLines: [{ line: 2, text: split }] },
    { path, addedLines: [{ line: 4, text: ours }, { line: 6, text: split }] },
  ]), {
    ok: false,
    hits: [{ path, line: 4, kind: "ours" }, { path, line: 6, kind: "split" }],
  });
});

test("a later closing marker qualifies only exact splits", () => {
  const path = "src/example.ts";
  assert.deepEqual(findConflictMarkers([{
    path,
    addedLines: [
      { line: 1, text: ` ${ours}` },
      { line: 2, text: "<".repeat(6) },
      { line: 3, text: split },
      { line: 4, text: "=".repeat(8) },
      { line: 5, text: `${split} ` },
      { line: 6, text: `${theirs} feature/example` },
    ],
  }]), {
    ok: false,
    hits: [{ path, line: 3, kind: "split" }, { path, line: 6, kind: "theirs" }],
  });
});

test("a base marker alone does not qualify a split", () => {
  const path = "src/example.ts";
  assert.deepEqual(findConflictMarkers([{
    path,
    addedLines: [{ line: 2, text: base }, { line: 3, text: split }],
  }]), { ok: false, hits: [{ path, line: 2, kind: "base" }] });
});

test("malformed input returns a plain reason without throwing", () => {
  const path = "src/example.ts";
  for (const input of [
    null,
    { path, addedLines: [] },
    [null],
    [{ addedLines: [] }],
    [{ path }],
    [{ path, addedLines: {} }],
    [{ path, addedLines: [null] }],
    [{ path, addedLines: [{ text: ours }] }],
    [{ path, addedLines: [{ line: 1 }] }],
    [{ path, addedLines: [{ line: 1, text: ours }, { line: 2, text: 42 }] }],
  ]) {
    const result = findConflictMarkers(input);
    assert.equal(result.ok, false);
    assert.deepEqual(result.hits, []);
    assert.match(result.reason ?? "", /^Expected .+\.$/);
  }
});
