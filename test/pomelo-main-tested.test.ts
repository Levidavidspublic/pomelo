import assert from "node:assert/strict";
import { test } from "node:test";
import { mainTested } from "../src/pomelo/main-tested.js";

const green = {
  sha: "aaa1111",
  pr: 1,
  message: "Update tests",
  checks: [{ conclusion: "success" }, { conclusion: "success" }],
};
const skipped = {
  sha: "bbb2222",
  pr: 2,
  message: "Update docs [skip ci]",
  checks: [],
};
const red = {
  ...green,
  sha: "ccc3333",
  pr: 3,
  checks: [{ conclusion: "failure" }],
};

test("wait when the newest commit skipped CI and has no checks", () => {
  const result = mainTested([skipped]);
  assert.equal(result.verdict, "wait");
  assert.equal(result.mayMerge, false);
  assert.deepEqual(result.untestedShas, [skipped.sha]);
  assert.equal(result.firstRedSha, null);
  assert.match(result.reason, /CI skip marker/i);
  assert.ok(result.reason.includes(skipped.sha));
  assert.doesNotMatch(result.reason, /Update docs|\[skip ci\]/);
});

test("go when the newest commit passed every check without a skip marker", () => {
  const result = mainTested([green, skipped]);
  assert.equal(result.verdict, "go");
  assert.equal(result.mayMerge, true);
  assert.deepEqual(result.untestedShas, []);
  assert.equal(result.firstRedSha, null);
});

test("wait when the newest commit has no checks even without a skip marker", () => {
  const result = mainTested([{ ...green, checks: [] }]);
  assert.equal(result.verdict, "wait");
  assert.equal(result.mayMerge, false);
});

test("a skip marker blocks merging even when the reported checks passed", () => {
  const result = mainTested([{ ...skipped, checks: green.checks }]);
  assert.equal(result.verdict, "wait");
  assert.equal(result.mayMerge, false);
  assert.deepEqual(result.untestedShas, [skipped.sha]);
});

test("stop and report the oldest SHA in the current run of failed checks", () => {
  const result = mainTested([{ ...red, sha: "ddd4444", pr: null }, red, green]);
  assert.equal(result.verdict, "stop");
  assert.equal(result.mayMerge, false);
  assert.equal(result.firstRedSha, red.sha);
});

test("list skip-marked commits newer than the last tested commit in input order", () => {
  const olderSkip = { ...skipped, sha: "eee5555", message: "Update fixtures\n\nskip-checks: true" };
  const pending = { ...green, sha: "fff6666", checks: [{ conclusion: null }] };
  const result = mainTested([skipped, pending, olderSkip, green, { ...skipped, sha: "abc7777" }]);
  assert.equal(result.verdict, "wait");
  assert.equal(result.mayMerge, false);
  assert.deepEqual(result.untestedShas, [skipped.sha, olderSkip.sha]);
});

test("wait for empty or malformed history", () => {
  for (const commits of [
    [],
    null,
    [null],
    [{ ...green, message: 123 }],
    [{ ...green, checks: null }],
    [{ ...green, checks: [null] }],
    [green, { ...skipped, message: null }],
  ]) {
    const result = mainTested(commits);
    assert.equal(result.verdict, "wait");
    assert.equal(result.mayMerge, false);
    assert.equal(result.firstRedSha, null);
  }
});
