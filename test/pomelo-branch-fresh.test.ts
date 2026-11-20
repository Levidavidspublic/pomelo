import assert from "node:assert/strict";
import { test } from "node:test";
import { branchFresh } from "../src/pomelo/branch-fresh.js";

const fresh = {
  currentBaseCommit: "current",
  testedBaseCommit: "current",
  behindBy: 0,
  testedBaseInHistory: true,
  baseChangedFiles: [],
  prChangedFiles: ["src/pomelo/example.ts"],
};
const stale = { ...fresh, testedBaseCommit: "older", behindBy: 1 };

test("checks run against the current base allow a merge", () => {
  const result = branchFresh(fresh);
  assert.equal(result.action, "merge");
  assert.match(result.reason, /checks ran against the current base/i);
  assert.deepEqual(result.sharedFiles, []);
  assert.deepEqual(result.riskyFiles, []);
});

test("a PR behind the base must update and rerun checks even without shared files", () => {
  for (const behindBy of [1, 3]) {
    const result = branchFresh({ ...stale, behindBy, baseChangedFiles: ["src/pomelo/other.ts"] });
    assert.equal(result.action, "update-first");
    assert.match(result.reason, new RegExp(`\\b${behindBy} ${behindBy === 1 ? "commit" : "commits"}\\b`));
    assert.match(result.reason, /rerun/i);
    assert.deepEqual(result.sharedFiles, []);
    assert.deepEqual(result.riskyFiles, []);
  }
  assert.equal(branchFresh({ ...fresh, behindBy: 1 }).action, "update-first");
});

test("a PR already updated to the current base still needs to rerun stale checks", () => {
  const result = branchFresh({ ...stale, behindBy: 0 });
  assert.equal(result.action, "update-first");
  assert.match(result.reason, /checks ran against an older base/i);
  assert.match(result.reason, /rerun/i);
});

test("shared paths and risky base changes are normalized, deduplicated and reported in order", () => {
  const input = {
    ...stale,
    baseChangedFiles: [
      "tsconfig.json", "src\\pomelo\\z.ts", "scripts\\test.mjs", "package.json",
      "src/pomelo/a.ts", "package-lock.json", "src/pomelo/z.ts", "fixtures/package.json",
    ],
    prChangedFiles: ["src/pomelo/z.ts", "package.json", "src\\pomelo\\a.ts"],
  };
  const result = branchFresh(input);
  assert.equal(result.action, "update-first");
  assert.deepEqual(result.sharedFiles, ["package.json", "src/pomelo/a.ts", "src/pomelo/z.ts"]);
  assert.deepEqual(result.riskyFiles, ["package-lock.json", "package.json", "scripts/test.mjs", "tsconfig.json"]);
  for (const file of [...result.sharedFiles, ...result.riskyFiles]) {
    assert.ok(result.reason.includes(file), file);
  }
  assert.deepEqual(branchFresh(input), result);
  assert.deepEqual(branchFresh({
    ...input,
    baseChangedFiles: input.baseChangedFiles.toReversed(),
    prChangedFiles: input.prChangedFiles.toReversed(),
  }), result);
});

test("missing or empty commit IDs require Amit", () => {
  const { currentBaseCommit, testedBaseCommit, ...otherInputs } = fresh;
  for (const input of [
    { ...otherInputs, currentBaseCommit },
    { ...otherInputs, testedBaseCommit },
    { ...fresh, currentBaseCommit: "" },
    { ...fresh, testedBaseCommit: "   " },
  ]) {
    const result = branchFresh(input);
    assert.equal(result.action, "ask-amit");
    assert.match(result.reason, /commit ID/i);
  }
});

test("negative or non-whole behind counts require Amit even when the commit IDs match", () => {
  for (const behindBy of [-1, 0.5, NaN, Infinity]) {
    const result = branchFresh({ ...fresh, behindBy });
    assert.equal(result.action, "ask-amit");
    assert.match(result.reason, /whole number/i);
  }
});

test("a tested commit outside the base history requires Amit", () => {
  for (const input of [fresh, stale]) {
    const result = branchFresh({ ...input, testedBaseInHistory: false });
    assert.equal(result.action, "ask-amit");
    assert.match(result.reason, /base branch's history/i);
  }
});
