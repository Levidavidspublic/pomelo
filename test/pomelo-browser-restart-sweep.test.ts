import assert from "node:assert/strict";
import test from "node:test";
import { sweepOnRestart } from "../src/pomelo/browser/restart-sweep.js";
import type { SweepJob } from "../src/pomelo/browser/restart-sweep.js";

const now = 2000;
const job: SweepJob = {
  id: "job-1",
  profileId: "profile-1",
  state: "running",
  runner: "pc",
  thisRunner: "pc",
  lastStepKind: "read",
  lastStepAt: 1000,
};

test("a PC restart holds running jobs after read, click, navigate or no step", () => {
  for (const lastStepKind of ["read", "click", "navigate", undefined] as const) {
    const running = { ...job, lastStepKind, lastStepAt: lastStepKind ? job.lastStepAt : undefined };
    assert.deepEqual(sweepOnRestart([running], now), {
      actions: [{ id: job.id, action: "hold", state: "waiting", reason: "restarted", needsAmit: false }],
      locksToRelease: [job.profileId],
    });
  }
});

test("interrupted fills, imports and downloads wait for Amit", () => {
  for (const lastStepKind of ["fill", "import", "download"] as const) {
    assert.deepEqual(sweepOnRestart([{ ...job, lastStepKind }], now), {
      actions: [{
        id: job.id,
        action: "hold-for-amit",
        state: "waiting",
        reason: `restarted-mid-${lastStepKind}`,
        needsAmit: true,
      }],
      locksToRelease: [job.profileId],
    });
  }
});

test("a VPS job is kept during a PC restart and held during a VPS restart", () => {
  const vpsJob = { ...job, runner: "vps" } as const;
  assert.deepEqual(sweepOnRestart([vpsJob], now), {
    actions: [{ id: job.id, action: "keep" }],
    locksToRelease: [],
  });
  assert.deepEqual(sweepOnRestart([{ ...vpsJob, thisRunner: "vps" }], now), {
    actions: [{ id: job.id, action: "hold", state: "waiting", reason: "restarted", needsAmit: false }],
    locksToRelease: [job.profileId],
  });
});

test("a running job on another runner protects its shared profile lock in either input order", () => {
  const vpsJob = { ...job, id: "vps-job", runner: "vps" } as const;
  for (const jobs of [[job, vpsJob], [vpsJob, job]]) {
    assert.deepEqual(sweepOnRestart(jobs, now), {
      actions: jobs.map(({ id }) => id === job.id
        ? { id, action: "hold", state: "waiting", reason: "restarted", needsAmit: false }
        : { id, action: "keep" }),
      locksToRelease: [],
    });
  }
});

test("a profile with multiple interrupted jobs has no single running lock owner", () => {
  const result = sweepOnRestart([job, { ...job, id: "job-2" }], now);
  assert.deepEqual(result.actions.map(({ action }) => action), ["hold", "hold"]);
  assert.deepEqual(result.locksToRelease, []);
});

test("a restart keeps every non-running job and reports an unknown state", () => {
  const jobs = ["queued", "waiting", "done", "failed", "cancelled", "unrecognized"].map((state) =>
    Object.freeze({ ...job, id: `${state}-job`, state, lastStepKind: "fill" as const }));
  const before = structuredClone(jobs);

  assert.deepEqual(sweepOnRestart(jobs, now), {
    actions: [
      { id: "queued-job", action: "keep" },
      { id: "waiting-job", action: "keep" },
      { id: "done-job", action: "keep" },
      { id: "failed-job", action: "keep" },
      { id: "cancelled-job", action: "keep" },
      { id: "unrecognized-job", action: "keep", reason: "unknown-state" },
    ],
    locksToRelease: [],
  });
  assert.deepEqual(jobs, before);
});

test("the sweep returns one action per job in order and leaves step details out of its output", () => {
  const stepText = "example step description";
  const stepAddress = "https://example.invalid/fixture";
  const stepValue = "example field entry";
  const jobs = [
    Object.freeze({ ...job, stepText, stepAddress, stepValue }),
    Object.freeze({ ...job, id: "job-2", state: "waiting", stepText, stepAddress, stepValue }),
    Object.freeze({ ...job, id: "job-3", profileId: "profile-3", lastStepKind: "fill" as const, stepText, stepAddress, stepValue }),
  ];
  const before = structuredClone(jobs);
  const result = sweepOnRestart(jobs, now);

  assert.equal(result.actions.length, jobs.length);
  assert.deepEqual(result.actions.map(({ id }) => id), jobs.map(({ id }) => id));
  assert.deepEqual(result.locksToRelease, [job.profileId, "profile-3"]);
  assert.deepEqual(jobs, before);
  const json = JSON.stringify(result);
  for (const detail of [stepText, stepAddress, stepValue]) {
    assert.equal(json.includes(detail), false);
  }
});

test("an empty sweep has no actions or locks to release", () => {
  assert.deepEqual(sweepOnRestart([], now), { actions: [], locksToRelease: [] });
});
