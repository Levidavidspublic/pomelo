import assert from "node:assert/strict";
import test from "node:test";
import { checkLock } from "../src/pomelo/browser/lock-stale.js";

const lock = { profileId: "profile-1", jobId: "job-1" };
const now = 1_000_000;
const staleAfterMs = 30_000;
const runningJob = { id: lock.jobId, state: "running", lastHeartbeatAt: now } as const;
const input = { lock, job: runningJob, now, staleAfterMs };
const cannotTell = { verdict: "held", reason: "cannot_tell" };

test("a profile without a lock is free", () => {
  assert.deepEqual(checkLock({ ...input, lock: null }), { verdict: "free", reason: "no_lock" });
});

test("a lock whose holder is missing is stale", () => {
  assert.deepEqual(checkLock({ ...input, job: null }), { verdict: "stale", reason: "job_missing" });
});

test("a lock whose holder ended is stale", () => {
  for (const state of ["done", "failed", "cancelled"] as const) {
    assert.deepEqual(
      checkLock({ ...input, job: { id: lock.jobId, state } }),
      { verdict: "stale", reason: "job_ended" },
      state,
    );
  }
});

test("a running job holds the lock through the heartbeat cutoff", () => {
  for (const age of [staleAfterMs - 1, staleAfterMs]) {
    const job = { ...runningJob, lastHeartbeatAt: now - age };
    assert.deepEqual(checkLock({ ...input, job }), { verdict: "held", reason: "heartbeat_fresh" });
  }
});

test("a running job with a heartbeat older than the cutoff has a stale lock", () => {
  const job = { ...runningJob, lastHeartbeatAt: now - staleAfterMs - 1 };
  assert.deepEqual(checkLock({ ...input, job }), { verdict: "stale", reason: "no_heartbeat" });
});

test("a job waiting for Amit keeps its lock even with an old heartbeat", () => {
  const job = { id: lock.jobId, state: "waiting", lastHeartbeatAt: now - 10 * staleAfterMs } as const;
  assert.deepEqual(checkLock({ ...input, job }), { verdict: "held", reason: "waiting_for_amit" });
});

test("a different job's final state cannot make the holder's lock stale", () => {
  const job = { id: "job-2", state: "done" } as const;
  assert.deepEqual(checkLock({ ...input, job }), cannotTell);
});

test("a queued holder with an old heartbeat keeps its lock", () => {
  const job = { ...runningJob, state: "queued", lastHeartbeatAt: now - 10 * staleAfterMs } as const;
  assert.deepEqual(checkLock({ ...input, job }), cannotTell);
});

test("a running holder keeps its lock when the heartbeat is missing, invalid, or in the future", () => {
  assert.deepEqual(checkLock({ ...input, job: { id: lock.jobId, state: "running" } }), cannotTell);
  for (const lastHeartbeatAt of [null, NaN, -Infinity, now + 1]) {
    assert.deepEqual(checkLock({ ...input, job: { ...runningJob, lastHeartbeatAt } }), cannotTell);
  }
});

test("a future heartbeat keeps the lock even when the holder is marked done", () => {
  const job = { ...runningJob, state: "done", lastHeartbeatAt: now + 1 } as const;
  assert.deepEqual(checkLock({ ...input, job }), cannotTell);
});

test("unusable clock or cutoff values keep a running holder's lock", () => {
  const job = { ...runningJob, lastHeartbeatAt: now - staleAfterMs - 1 };
  for (const invalidCutoff of [0, -1, NaN, Infinity]) {
    assert.deepEqual(checkLock({ ...input, job, staleAfterMs: invalidCutoff }), cannotTell);
  }
  assert.deepEqual(checkLock({ ...input, job, now: Infinity }), cannotTell);
});
