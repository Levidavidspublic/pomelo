import assert from "node:assert/strict";
import test from "node:test";
import { jobFinish, type JobFinishFacts } from "../src/pomelo/browser/job-finish.js";

const finished = {
  state: "running",
  heldSteps: [],
  pendingApprovals: [],
  liveGrants: [],
  runningDownloads: 0,
  runningImports: 0,
  lastVerdict: "go",
  resultLine: "Sample task complete",
} satisfies JobFinishFacts;

test("a running job with a result and no blockers can finish", () => {
  assert.deepEqual(jobFinish(finished), { decision: "done", reasons: [], line: "Finished" });
});

const blockers = [
  [{ heldSteps: [{}] }, "hold", "held_step_open", "Waiting for you: 1 step needs an answer"],
  [{ pendingApprovals: [{}] }, "hold", "approval_pending", "Waiting for you: 1 approval needs an answer"],
  [{ liveGrants: [{}] }, "not_yet", "grant_live", "Not finished yet: 1 fill grant still live"],
  [{ runningDownloads: 1 }, "not_yet", "download_running", "Not finished yet: 1 download still running"],
  [{ runningImports: 1 }, "not_yet", "import_running", "Not finished yet: 1 import still running"],
  [{ resultLine: " \n\t" }, "not_yet", "no_result", "Not finished yet: the agent has no result yet"],
  [{ lastVerdict: "hold" }, "hold", "last_step_stopped", "Waiting for you: the last step stopped"],
  [{ lastVerdict: "refuse" }, "hold", "last_step_stopped", "Waiting for you: the last step stopped"],
  [{ lastVerdict: "wait" }, "not_yet", "last_step_waiting", "Not finished yet: the last step is still waiting"],
] as const;

for (const [facts, decision, reason, line] of blockers) {
  test(`reports ${reason} for ${JSON.stringify(facts)}`, () => {
    assert.deepEqual(jobFinish({ ...finished, ...facts }), { decision, reasons: [reason], line });
  });
}

test("a missing result line blocks completion", () => {
  const facts: JobFinishFacts = { ...finished };
  delete facts.resultLine;
  assert.deepEqual(jobFinish(facts), {
    decision: "not_yet",
    reasons: ["no_result"],
    line: "Not finished yet: the agent has no result yet",
  });
});

test("every blocker is reported in order and a hold takes priority", () => {
  assert.deepEqual(jobFinish({
    ...finished,
    heldSteps: [{}, {}],
    pendingApprovals: [{}],
    liveGrants: [{}],
    runningDownloads: 1,
    runningImports: 1,
    lastVerdict: "refuse",
    resultLine: "",
  }), {
    decision: "hold",
    reasons: [
      "held_step_open", "approval_pending", "grant_live", "download_running", "import_running", "no_result",
      "last_step_stopped",
    ],
    line: "Waiting for you: 2 steps need an answer",
  });

  assert.deepEqual(jobFinish({ ...finished, lastVerdict: "refuse", runningDownloads: 2 }), {
    decision: "hold",
    reasons: ["download_running", "last_step_stopped"],
    line: "Waiting for you: the last step stopped",
  });
});

test("final states cannot finish again even when other blockers are present", () => {
  for (const state of ["done", "failed", "cancelled"]) {
    const expected = {
      decision: "not_yet",
      reasons: ["already_final"],
      line: "Not finished yet: the job has already ended",
    };
    assert.deepEqual(jobFinish({ ...finished, state }), expected);
    assert.deepEqual(jobFinish({ ...finished, state, lastVerdict: "hold" }), expected);
  }
});

test("a queued job must start and a waiting job stays on hold", () => {
  assert.deepEqual(jobFinish({ ...finished, state: "queued" }), {
    decision: "not_yet",
    reasons: ["not_started"],
    line: "Not finished yet: the job has not started",
  });
  assert.deepEqual(jobFinish({ ...finished, state: "waiting" }), {
    decision: "hold",
    reasons: ["job_waiting"],
    line: "Waiting for you: the job is waiting",
  });
});

test("the finish result contains no canary, result text, labels, or page address", () => {
  const canary = "synthetic-finish-canary";
  const pageAddress = "https://example.test/finish-canary";
  const resultLine = `Agent result ${canary} from ${pageAddress}`;
  const heldLabel = `Held step ${canary}`;
  const grantLabel = `Fill grant ${canary}`;
  const result = jobFinish({
    ...finished,
    resultLine,
    heldSteps: [{ label: heldLabel }],
    liveGrants: [{ label: grantLabel }],
  });
  assert.deepEqual(result, {
    decision: "hold",
    reasons: ["held_step_open", "grant_live"],
    line: "Waiting for you: 1 step needs an answer",
  });
  for (const text of [canary, resultLine, heldLabel, grantLabel, pageAddress]) {
    assert.equal(JSON.stringify(result).includes(text), false);
    assert.equal(JSON.stringify(jobFinish({ ...finished, resultLine })).includes(text), false);
  }
});

test("an unknown or missing verdict counts as a stop", () => {
  for (const lastVerdict of ["unknown", "GO", "", undefined]) {
    assert.deepEqual(jobFinish({ ...finished, lastVerdict }), {
      decision: "hold",
      reasons: ["last_step_stopped"],
      line: "Waiting for you: the last step stopped",
    });
  }
});

test("non-array lists block completion even with a length of zero", () => {
  const cases = [
    ["heldSteps", "hold", "held_step_open"],
    ["pendingApprovals", "hold", "approval_pending"],
    ["liveGrants", "not_yet", "grant_live"],
  ] as const;
  for (const [field, decision, reason] of cases) {
    const result = jobFinish({ ...finished, [field]: { length: 0 } });
    assert.equal(result.decision, decision);
    assert.deepEqual(result.reasons, [reason]);
  }
});

test("an invalid download or import count counts as one", () => {
  for (const invalidCount of [-1, NaN, Infinity, 0.5, "0", undefined]) {
    assert.deepEqual(jobFinish({ ...finished, runningDownloads: invalidCount }), {
      decision: "not_yet",
      reasons: ["download_running"],
      line: "Not finished yet: 1 download still running",
    });
    assert.deepEqual(jobFinish({ ...finished, runningImports: invalidCount }), {
      decision: "not_yet",
      reasons: ["import_running"],
      line: "Not finished yet: 1 import still running",
    });
  }
});

test("malformed input blocks completion without throwing", () => {
  const { proxy, revoke } = Proxy.revocable(finished, {});
  revoke();
  for (const input of [
    undefined, null, "running", 1, [], {}, proxy, Object.create(finished),
    { ...finished, state: "unknown" }, { ...finished, resultLine: {} },
  ]) {
    assert.notEqual(jobFinish(input).decision, "done");
  }
});

test("accessors cannot supply missing facts", () => {
  let read = false;
  const result = jobFinish({
    ...finished,
    get heldSteps() {
      read = true;
      return [];
    },
  });
  assert.equal(read, false);
  assert.equal(result.decision, "hold");
  assert.deepEqual(result.reasons, ["held_step_open"]);
});
