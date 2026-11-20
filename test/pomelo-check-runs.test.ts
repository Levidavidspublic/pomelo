import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRuns } from "../src/pomelo/check-runs.js";

const headSha = "current";
const passed = {
  id: 10,
  name: "tests",
  head_sha: headSha,
  status: "completed",
  conclusion: "success",
  started_at: "2026-11-19T10:00:00Z",
  completed_at: "2026-11-19T10:01:00Z",
};

test("all required checks pass in a GitHub response", () => {
  const json = JSON.stringify({ total_count: 2, check_runs: [passed, { ...passed, id: 11, name: "lint" }] });
  assert.deepEqual(checkRuns(json, headSha, ["tests", "lint"]), { ok: true, problems: [] });
});

test("a bare array can pass even with an extra failing check", () => {
  const json = JSON.stringify([passed, { ...passed, id: 11, name: "preview", conclusion: "failure" }]);
  assert.deepEqual(checkRuns(json, headSha, ["tests"]), { ok: true, problems: [] });
});

test("missing checks are named and problems are sorted", () => {
  const json = JSON.stringify([{ ...passed, conclusion: "failure" }]);
  const result = checkRuns(json, headSha, ["tests", "lint", "build"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [
    { name: "build", code: "missing", message: "Required check \"build\" is missing." },
    { name: "lint", code: "missing", message: "Required check \"lint\" is missing." },
    { name: "tests", code: "failed", message: "Required check \"tests\" failed." },
  ]);
});

for (const [status, conclusion, code, reason] of [
  ["queued", null, "queued", "is queued"],
  ["in_progress", null, "in_progress", "is still running"],
  ["in_progress", "success", "in_progress", "is still running"],
  ["completed", "skipped", "skipped", "was skipped"],
  ["completed", "neutral", "neutral", "finished with a neutral result"],
  ["completed", "cancelled", "cancelled", "was cancelled"],
  ["completed", "timed_out", "timed_out", "timed out"],
  ["completed", "failure", "failed", "failed"],
  ["completed", "action_required", "unsuccessful", "did not report success"],
] as const) {
  test(`${status} with conclusion ${conclusion} blocks a required check`, () => {
    const json = JSON.stringify([{ ...passed, status, conclusion }]);
    assert.deepEqual(checkRuns(json, headSha, ["tests"]), {
      ok: false,
      problems: [{ name: "tests", code, message: `Required check "tests" ${reason}.` }],
    });
  });
}

test("a successful check on an older commit does not pass", () => {
  const json = JSON.stringify([{ ...passed, head_sha: "older" }]);
  assert.deepEqual(checkRuns(json, headSha, ["tests"]), {
    ok: false,
    problems: [{
      name: "tests",
      code: "older_commit",
      message: 'Required check "tests" ran on a different commit.',
    }],
  });
});

test("a run without a commit does not pass", () => {
  const json = JSON.stringify([{ ...passed, head_sha: undefined }]);
  const result = checkRuns(json, headSha, ["tests"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ name, code }) => ({ name, code })), [
    { name: "tests", code: "missing_head" },
  ]);
});

test("completion time picks the newest run ahead of start time and ID", () => {
  const failed = {
    ...passed,
    id: 9,
    conclusion: "failure",
    started_at: "2026-11-19T09:59:00Z",
    completed_at: "2026-11-19T10:02:00Z",
  };
  for (const runs of [[failed, passed], [passed, failed]]) {
    const result = checkRuns(JSON.stringify(runs), headSha, ["tests"]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map(({ code }) => code), ["failed"]);
  }
});

test("start time breaks a completion tie and can pick a passing rerun", () => {
  const failed = { ...passed, id: 11, conclusion: "failure", started_at: "2026-11-19T09:59:00Z" };
  for (const runs of [[failed, passed], [passed, failed]]) {
    assert.deepEqual(checkRuns(JSON.stringify(runs), headSha, ["tests"]), { ok: true, problems: [] });
  }
});

test("ID breaks a tie when the timestamps match", () => {
  const failed = { ...passed, id: 9, conclusion: "failure" };
  assert.deepEqual(checkRuns(JSON.stringify([passed, failed]), headSha, ["tests"]), {
    ok: true,
    problems: [],
  });
});

test("a newer running or queued rerun blocks an earlier success", () => {
  const running = {
    ...passed,
    id: 11,
    status: "in_progress",
    conclusion: null,
    started_at: "2026-11-19T10:02:00Z",
    completed_at: null,
  };
  const queued = { ...running, id: 12, status: "queued", started_at: null };
  for (const rerun of [running, queued]) {
    const result = checkRuns(JSON.stringify([rerun, passed]), headSha, ["tests"]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map(({ code }) => code), [rerun.status]);
  }
});

test("a newer run on another commit blocks an earlier success on the head", () => {
  const rerun = { ...passed, id: 11, head_sha: "older" };
  const result = checkRuns(JSON.stringify([passed, rerun]), headSha, ["tests"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ code }) => code), ["older_commit"]);
});

test("invalid JSON or an invalid check list returns a reason", () => {
  for (const json of ["{", "null", '{"check_runs":{}}']) {
    const result = checkRuns(json, headSha, ["tests"]);
    assert.equal(result.ok, false);
    assert.equal(result.problems[0]?.code, "invalid_json");
    assert.ok(result.problems[0]?.message);
  }
});

test("an empty required list returns a reason", () => {
  assert.deepEqual(checkRuns(JSON.stringify([passed]), headSha, []), {
    ok: false,
    problems: [{ name: null, code: "empty_required", message: "No required checks were listed." }],
  });
});
