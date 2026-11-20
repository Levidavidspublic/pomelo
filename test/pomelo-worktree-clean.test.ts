import assert from "node:assert/strict";
import test from "node:test";
import { checkWorktree } from "../src/pomelo/worktree-clean.js";

test("empty porcelain output is clean", () => {
  const result = checkWorktree("");
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.leftovers, []);
  assert.ok(result.reason);
});

test("names untracked, modified, staged, deleted, and conflicted files", () => {
  const result = checkWorktree("?? scratch.txt\n M src/a.ts\nM  src/b.ts\n D x\nUU y\n");
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "dirty");
  assert.deepEqual(result.leftovers, [
    { path: "scratch.txt", kind: "untracked" },
    { path: "src/a.ts", kind: "modified" },
    { path: "src/b.ts", kind: "staged" },
    { path: "x", kind: "deleted" },
    { path: "y", kind: "conflict" },
  ]);
  assert.ok(result.reason);
});

test("names the source and destination of a rename", () => {
  const result = checkWorktree("R  a -> b");
  assert.equal(result.verdict, "dirty");
  assert.deepEqual(result.leftovers, [
    { path: "a", kind: "renamed" },
    { path: "b", kind: "renamed" },
  ]);
});

test("preserves spaces and decodes Git-quoted paths", () => {
  const result = checkWorktree([
    '?? "scratch file.txt"',
    "?? unquoted file.txt",
    "??  padded.txt ",
    'R  "old -> draft.ts" -> new draft.ts',
    'R  other draft.ts -> "final -> draft.ts"',
    String.raw`?? "caf\303\251 \042notes\042.txt"`,
  ].join("\n"));
  assert.equal(result.verdict, "dirty");
  assert.deepEqual(result.leftovers, [
    { path: "scratch file.txt", kind: "untracked" },
    { path: "unquoted file.txt", kind: "untracked" },
    { path: " padded.txt ", kind: "untracked" },
    { path: "old -> draft.ts", kind: "renamed" },
    { path: "new draft.ts", kind: "renamed" },
    { path: "other draft.ts", kind: "renamed" },
    { path: "final -> draft.ts", kind: "renamed" },
    { path: 'café "notes".txt', kind: "untracked" },
  ]);
});

test("matches allowed files and directories on path boundaries", () => {
  const opts = { allow: ["./cache/", "scratch.txt"] };
  assert.equal(checkWorktree('?? "cache/a file"\n?? scratch.txt', opts).verdict, "clean");
  assert.deepEqual(checkWorktree("?? cache/\n?? cache-old/file\n?? scratch.txt.bak", opts).leftovers, [
    { path: "cache-old/file", kind: "untracked" },
    { path: "scratch.txt.bak", kind: "untracked" },
  ]);
});

test("checks each side of a rename against the allow list", () => {
  const opts = { allow: ["cache"] };
  assert.equal(checkWorktree("R  cache/old -> cache/new", opts).verdict, "clean");
  const result = checkWorktree("R  cache/old -> new", opts);
  assert.equal(result.verdict, "dirty");
  assert.deepEqual(result.leftovers, [{ path: "new", kind: "renamed" }]);
});

test("fails closed on malformed lines and still names readable paths", () => {
  for (const line of [
    "garbage", "ZZ x", "M x", "?? ", '?? "unterminated', String.raw`?? "bad\q"`,
    "R  a", "R  a -> ", "", "?? cache/../x",
  ]) {
    const result = checkWorktree(`?? cache/allowed\n${line}\n?? other\n`, { allow: ["cache"] });
    assert.equal(result.ok, false, JSON.stringify(line));
    assert.equal(result.verdict, "unreadable", JSON.stringify(line));
    assert.deepEqual(result.leftovers, [{ path: "other", kind: "untracked" }]);
    assert.match(result.reason, /line 2/);
  }
});

test("accepts CRLF line endings", () => {
  const result = checkWorktree("?? scratch.txt\r\n M src/a.ts\r\n");
  assert.equal(result.verdict, "dirty");
  assert.deepEqual(result.leftovers, [
    { path: "scratch.txt", kind: "untracked" },
    { path: "src/a.ts", kind: "modified" },
  ]);
});
