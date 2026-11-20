import assert from "node:assert/strict";
import test from "node:test";
import { findRemovedUpstreamFiles } from "../src/pomelo/upstream-keep.js";

const fridayPaths = ["src/app.ts", "src/agent-mesh.ts", "src/client/App.tsx", "scripts/test.mjs", "LICENSE"];

test("reports each deleted Friday path and allows edits to Friday files", () => {
  const diff = ["D\tsrc/app.ts", "M\tsrc/client/App.tsx", "D\tscripts/test.mjs", "D\tLICENSE"].join("\n");

  assert.deepEqual(findRemovedUpstreamFiles(diff, fridayPaths), [
    { path: "src/app.ts", kind: "deleted", reason: '"src/app.ts" was deleted.' },
    { path: "scripts/test.mjs", kind: "deleted", reason: '"scripts/test.mjs" was deleted.' },
    { path: "LICENSE", kind: "deleted", reason: '"LICENSE" was deleted.' },
  ]);
});

test("reports both paths for renames and moves, including moves into Pomelo", () => {
  const diff = [
    "R100\tsrc/agent-mesh.ts\tsrc/mesh.ts",
    "R095\tsrc/app.ts\tsrc/pomelo/app.ts",
    "R100\tsrc/client/App.tsx\tsrc/client/pomelo/Main.tsx",
  ].join("\n");

  assert.deepEqual(findRemovedUpstreamFiles(diff, fridayPaths), [
    { path: "src/agent-mesh.ts", kind: "renamed", reason: '"src/agent-mesh.ts" was renamed to "src/mesh.ts".' },
    { path: "src/app.ts", kind: "moved", reason: '"src/app.ts" was moved to "src/pomelo/app.ts".' },
    {
      path: "src/client/App.tsx",
      kind: "moved",
      reason: '"src/client/App.tsx" was moved to "src/client/pomelo/Main.tsx".',
    },
  ]);
});

test("allows copies that keep the source and reports a copied source that was deleted", () => {
  const copy = "C100\tsrc/app.ts\tsrc/client/pomelo/app.ts";
  assert.deepEqual(findRemovedUpstreamFiles(copy, fridayPaths), []);

  for (const diff of [`${copy}\nD\tsrc/app.ts`, `D\tsrc/app.ts\n${copy}`]) {
    assert.deepEqual(findRemovedUpstreamFiles(diff, fridayPaths), [
      { path: "src/app.ts", kind: "deleted", reason: '"src/app.ts" was deleted.' },
    ]);
  }
});

test("ignores Pomelo's own files and Friday's test files", () => {
  const pomeloPaths = ["src/pomelo/example.ts", "src/client/pomelo/Panel.tsx", "test/pomelo-example.test.ts", "POMELO.md"];
  const fridayTest = "test/acp.test.ts";
  const diff = [
    ...pomeloPaths.flatMap((path) => ["A", "M", "D"].map((status) => `${status}\t${path}`)),
    `D\t${fridayTest}`,
    "D\tsrc/added-after-import.ts",
  ].join("\n");

  assert.deepEqual(findRemovedUpstreamFiles(diff, [...fridayPaths, ...pomeloPaths, fridayTest]), []);
});

test("reads spaces and Git-quoted paths without changing the original file name", () => {
  const quoted = String.raw`"src/with \"quotes\".ts"`;
  const octal = String.raw`"src/caf\303\251\tfile.ts"`;
  const diff = [
    "D\tsrc/with space.ts",
    `R100\t${quoted}\tsrc/without quotes.ts`,
    `D\t${octal}`,
    "",
  ].join("\r\n");

  assert.deepEqual(findRemovedUpstreamFiles(diff, ["src/with space.ts", 'src/with "quotes".ts', "src/café\tfile.ts"]), [
    { path: "src/with space.ts", kind: "deleted", reason: '"src/with space.ts" was deleted.' },
    {
      path: 'src/with "quotes".ts',
      kind: "renamed",
      reason: String.raw`"src/with \"quotes\".ts" was renamed to "src/without quotes.ts".`,
    },
    { path: "src/café\tfile.ts", kind: "deleted", reason: String.raw`"src/café\tfile.ts" was deleted.` },
  ]);
});

test("returns an empty list for empty text", () => {
  assert.deepEqual(findRemovedUpstreamFiles("", fridayPaths), []);
});

test("identifies unreadable lines by number and keeps checking later rows", () => {
  const diff = ["unreadable row", "R100\tsrc/agent-mesh.ts", 'D\t"unterminated', "D\tsrc/app.ts"].join("\n");

  assert.deepEqual(findRemovedUpstreamFiles(diff, fridayPaths), [
    { path: null, kind: "unreadable", reason: "The check could not read this line (line 1)." },
    { path: null, kind: "unreadable", reason: "The check could not read this line (line 2)." },
    { path: null, kind: "unreadable", reason: "The check could not read this line (line 3)." },
    { path: "src/app.ts", kind: "deleted", reason: '"src/app.ts" was deleted.' },
  ]);
});
