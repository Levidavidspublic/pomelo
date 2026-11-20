import assert from "node:assert/strict";
import { test } from "node:test";
import { mainCommitFromCheckRuns } from "../src/pomelo/main-red-input.js";
import { mainHealth } from "../src/pomelo/main-red.js";

const sha = "main-sha";
const pr = 42;
const passed = {
  id: 10,
  name: "tests",
  head_sha: sha,
  status: "completed",
  conclusion: "success",
  started_at: "2026-11-19T10:00:00Z",
  completed_at: "2026-11-19T10:01:00Z",
};
const failed = { ...passed, conclusion: "failure" };
const lint = { ...passed, id: 11, name: "lint" };
const required = ["tests", "lint"];

test("go when each distinct required check passes", () => {
  const json = JSON.stringify({
    total_count: 3,
    check_runs: [passed, lint, { ...failed, name: "preview" }],
  });
  const commit = mainCommitFromCheckRuns(sha, null, json, ["tests", "lint", "tests"]);
  assert.deepEqual(commit, {
    sha,
    pr: null,
    checks: [{ conclusion: "success" }, { conclusion: "success" }],
  });
  assert.equal(mainHealth([commit]).verdict, "go");
});

test("stop when a required check fails", () => {
  const commit = mainCommitFromCheckRuns(sha, pr, JSON.stringify([failed, lint]), required);
  assert.deepEqual(commit.checks, [{ conclusion: "failure" }, { conclusion: "success" }]);
  const result = mainHealth([commit]);
  assert.equal(result.verdict, "stop");
  assert.equal(result.firstRedSha, sha);
  assert.equal(result.firstRedPr, pr);
});

test("wait when one required check is missing", () => {
  const commit = mainCommitFromCheckRuns(sha, pr, JSON.stringify([passed]), required);
  assert.deepEqual(commit.checks, [{ conclusion: "success" }, { conclusion: null }]);
  assert.equal(mainHealth([commit]).verdict, "wait");
});

test("wait with a single unset check when the check-runs JSON cannot be read", () => {
  for (const json of ["{", "null", '{"check_runs":{}}']) {
    const commit = mainCommitFromCheckRuns(sha, pr, json, required);
    assert.deepEqual(commit, { sha, pr, checks: [{ conclusion: null }] });
    assert.equal(mainHealth([commit]).verdict, "wait");
  }
});

test("wait with a single unset check when there are no required checks", () => {
  const commit = mainCommitFromCheckRuns(sha, pr, JSON.stringify([passed]), []);
  assert.deepEqual(commit.checks, [{ conclusion: null }]);
  assert.equal(mainHealth([commit]).verdict, "wait");
});

test("a check on another commit counts as missing", () => {
  const json = JSON.stringify([passed, { ...lint, head_sha: "other-sha" }]);
  const commit = mainCommitFromCheckRuns(sha, pr, json, required);
  assert.deepEqual(commit.checks, [{ conclusion: "success" }, { conclusion: null }]);
  assert.equal(mainHealth([commit]).verdict, "wait");
});

test("a newer run on another commit does not displace a run on main", () => {
  const json = JSON.stringify([passed, { ...failed, head_sha: "other-sha", id: 12 }]);
  const commit = mainCommitFromCheckRuns(sha, pr, json, ["tests"]);
  assert.deepEqual(commit.checks, [{ conclusion: "success" }]);
  assert.equal(mainHealth([commit]).verdict, "go");
});

for (const [order, rerun] of [
  ["completion time", { ...passed, id: 9, completed_at: "2026-11-19T10:02:00Z" }],
  ["start time", { ...passed, id: 9, started_at: "2026-11-19T10:00:30Z" }],
  ["ID", { ...passed, id: 12 }],
] as const) {
  test(`a passing rerun replaces an older failure by ${order}`, () => {
    for (const runs of [[failed, rerun], [rerun, failed]]) {
      const commit = mainCommitFromCheckRuns(sha, pr, JSON.stringify(runs), ["tests"]);
      assert.deepEqual(commit.checks, [{ conclusion: "success" }]);
      assert.equal(mainHealth([commit]).verdict, "go");
    }
  });
}

for (const rerun of [
  { ...passed, id: 12, status: "queued", started_at: null, completed_at: null },
  { ...passed, id: 9, status: "in_progress", started_at: "2026-11-19T10:02:00Z", completed_at: null },
]) {
  test(`wait while a newer rerun is ${rerun.status}`, () => {
    const commit = mainCommitFromCheckRuns(sha, pr, JSON.stringify([failed, rerun]), ["tests"]);
    assert.deepEqual(commit.checks, [{ conclusion: null }]);
    assert.equal(mainHealth([commit]).verdict, "wait");
  });
}

test("a fully tied failure takes precedence over a success", () => {
  for (const runs of [[passed, failed], [failed, passed]]) {
    const commit = mainCommitFromCheckRuns(sha, pr, JSON.stringify(runs), ["tests"]);
    assert.deepEqual(commit.checks, [{ conclusion: "failure" }]);
    assert.equal(mainHealth([commit]).verdict, "stop");
  }
});

test("preserve the reported conclusion of a completed run", () => {
  const json = JSON.stringify([{ ...passed, conclusion: "action_required" }]);
  const commit = mainCommitFromCheckRuns(sha, pr, json, ["tests"]);
  assert.deepEqual(commit.checks, [{ conclusion: "action_required" }]);
  assert.equal(mainHealth([commit]).verdict, "wait");
});
