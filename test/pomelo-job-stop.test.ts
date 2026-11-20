import assert from "node:assert/strict";
import test from "node:test";
import { checkJobMove } from "../src/pomelo/browser/job-state.js";
import { jobStop } from "../src/pomelo/browser/job-stop.js";

const now = 200;
const running = { id: "running", threadId: "thread-a", state: "running" };
const queued = { ...running, id: "queued", state: "queued" };
const waiting = { ...running, id: "waiting", state: "waiting" };
const finishedStates = ["done", "failed", "cancelled"] as const;

test("stopping one running browser job returns only its cancellation and end time", () => {
  assert.deepEqual(jobStop([queued, running, waiting], { kind: "job", jobId: running.id }, now), {
    changes: [{ jobId: running.id, status: "cancelled", endedAt: now }],
  });
});

test("stopping a thread cancels queued, running and waiting jobs with valid moves", () => {
  const jobs = [queued, running, waiting, ...finishedStates.map((state) => ({ ...running, id: state, state, endedAt: 100 }))];
  const result = jobStop(jobs, { kind: "thread" }, now);
  assert.deepEqual(result, {
    changes: [queued, running, waiting].map(({ id }) => ({ jobId: id, status: "cancelled", endedAt: now })),
  });
  for (const { jobId, status } of result.changes) {
    const from = jobs.find(({ id }) => id === jobId)?.state;
    assert.deepEqual(checkJobMove({ from, to: status, by: "amit" }), { ok: true, reason: "allowed" });
  }
});

test("stopping a fill or import adds a fixed note and keeps goal text out of the result", () => {
  const canary = "job-stop-fixture-canary";
  const fill = { ...running, id: "fill", lastStepKind: "fill", goal: canary };
  const importing = { ...waiting, id: "import", lastStepKind: "import" };
  const read = { ...running, id: "read", lastStepKind: "read", steps: ["fill"] };
  const result = jobStop([fill, importing, read], { kind: "thread" }, now);
  assert.deepEqual(result, {
    changes: [
      { jobId: fill.id, status: "cancelled", endedAt: now, note: "stopped mid-fill" },
      { jobId: importing.id, status: "cancelled", endedAt: now, note: "stopped mid-import" },
      { jobId: read.id, status: "cancelled", endedAt: now },
    ],
  });
  const finished = jobStop([{ ...fill, state: "done" }], { kind: "job", jobId: fill.id }, now);
  assert.equal(finished.reason, "Job already finished.");
  assert.ok(!JSON.stringify([result, finished]).includes(canary));
});

test("stopping a queued job omits the note for fill or import metadata", () => {
  for (const lastStepKind of ["fill", "import"]) {
    assert.deepEqual(jobStop([{ ...queued, lastStepKind }], { kind: "job", jobId: queued.id }, now), {
      changes: [{ jobId: queued.id, status: "cancelled", endedAt: now }],
    });
  }
});

test("stopping an unknown or finished browser job returns its reason and no changes", () => {
  assert.deepEqual(jobStop([running], { kind: "job", jobId: "unknown" }, now), {
    changes: [], reason: "Unknown job.",
  });
  for (const state of finishedStates) {
    const finished = { ...running, state, endedAt: 100 };
    assert.deepEqual(jobStop([finished, waiting], { kind: "job", jobId: finished.id }, now), {
      changes: [], reason: "Job already finished.",
    });
  }
});

test("a stop with an explicit thread ID leaves all jobs from another thread alone", () => {
  const other = { ...running, id: "other", threadId: "thread-b" };
  assert.deepEqual(jobStop([other, running], { kind: "thread", threadId: running.threadId }, now), {
    changes: [{ jobId: running.id, status: "cancelled", endedAt: now }],
  });
  assert.deepEqual(jobStop([other, running], { kind: "job", threadId: running.threadId, jobId: other.id }, now), {
    changes: [], reason: "Unknown job.",
  });
  for (const request of [{ kind: "thread" }, { kind: "job", jobId: running.id }]) {
    assert.deepEqual(jobStop([running, other], request, now), {
      changes: [], reason: "Specify a thread for jobs from multiple threads.",
    });
  }
});

test("browser job stop leaves the input array and records intact", () => {
  const jobs = Object.freeze([
    Object.freeze({ ...running, resourceLock: "profile-a" }),
    Object.freeze({ ...waiting, state: "done", endedAt: 100 }),
  ]);
  const before = jobs.map((job) => ({ ...job }));
  jobStop(jobs, { kind: "job", jobId: running.id }, now);
  jobStop(jobs, { kind: "thread" }, now);
  assert.deepEqual(jobs, before);
  assert.deepEqual(jobStop([], { kind: "thread" }, now), { changes: [] });
});

test("malformed browser job stop inputs return a reason and no changes", () => {
  const request = { kind: "thread" };
  const inputs = [
    [null, request, now],
    [[running, null], request, now],
    [[running, { ...waiting, state: "stopping" }], request, now],
    [[running, { ...waiting, threadId: "" }], request, now],
    [[running, { ...waiting, lastStepKind: 123 }], request, now],
    [[running, running], request, now],
    [[running], null, now],
    [[running], { kind: "job" }, now],
    [[running], { kind: "other" }, now],
    [[running], request, NaN],
  ] as const;
  for (const [jobs, stop, time] of inputs) {
    const result = jobStop(jobs, stop, time);
    assert.deepEqual(result.changes, []);
    assert.ok(result.reason);
  }
});
