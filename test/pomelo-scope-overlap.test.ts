import assert from "node:assert/strict";
import test from "node:test";
import { scopeOverlaps, scopePaths } from "../src/pomelo/scope-overlap.js";

test("two running tickets share PATCHES.md and the higher number waits", () => {
  assert.deepEqual(scopeOverlaps([
    { number: 29, state: "running", scope: "`PATCHES.md` `src/pomelo/first.ts`" },
    { number: 4, state: "running", scope: "`PATCHES.md` `src/pomelo/second.ts`" },
  ]), {
    clashes: [{ file: "PATCHES.md", keep: 4, wait: 29 }],
    problems: [],
  });
});

test("done, held, and unrecognized ticket states are ignored", () => {
  assert.deepEqual(scopeOverlaps([
    { number: 10, state: "running", scope: "`PATCHES.md`" },
    { number: 11, state: "done", scope: "`PATCHES.md`" },
    { number: 12, state: "held", scope: "`PATCHES.md`" },
    { number: 13, state: "closed", scope: "No scope listed" },
  ]), { clashes: [], problems: [] });
});

test("scope paths are trimmed and leading ./ is removed", () => {
  assert.deepEqual(scopePaths("Edit ` ./PATCHES.md  ` and ` ./src/pomelo/example.ts `"), [
    "PATCHES.md",
    "src/pomelo/example.ts",
  ]);
  assert.deepEqual(scopeOverlaps([
    { number: 1, state: "new", scope: "` ./PATCHES.md `" },
    { number: 2, state: "running", scope: "`PATCHES.md`" },
  ]).clashes, [{ file: "PATCHES.md", keep: 1, wait: 2 }]);
});

test("a repeated path contributes only one clash with another ticket", () => {
  const ticket = { number: 1, state: "running", scope: "`PATCHES.md` `./PATCHES.md`" };

  assert.deepEqual(scopeOverlaps([ticket]), { clashes: [], problems: [] });
  assert.deepEqual(scopeOverlaps([
    ticket,
    { number: 2, state: "running", scope: "`PATCHES.md`" },
  ]).clashes, [{ file: "PATCHES.md", keep: 1, wait: 2 }]);
});

test("three active tickets sharing a file return every pair in numeric order", () => {
  const tickets = [
    { number: 29, state: "stuck", scope: "`PATCHES.md`" },
    { number: 4, state: "new", scope: "`PATCHES.md`" },
    { number: 10, state: "pr_open", scope: "`PATCHES.md`" },
  ];
  const expected = {
    clashes: [
      { file: "PATCHES.md", keep: 4, wait: 10 },
      { file: "PATCHES.md", keep: 4, wait: 29 },
      { file: "PATCHES.md", keep: 10, wait: 29 },
    ],
    problems: [],
  };

  assert.deepEqual(scopeOverlaps(tickets), expected);
  assert.deepEqual(scopeOverlaps(tickets.toReversed()), expected);
});

test("active tickets without a backticked path report no-paths", () => {
  assert.deepEqual(scopeOverlaps([
    { number: 2, state: "running", scope: "PATCHES.md" },
    { number: 1, state: "new", scope: "`  ` `` `./`" },
  ]), {
    clashes: [],
    problems: [
      { number: 1, reason: "no-paths" },
      { number: 2, reason: "no-paths" },
    ],
  });
});
