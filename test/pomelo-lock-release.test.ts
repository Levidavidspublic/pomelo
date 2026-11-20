import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserJobState } from "../src/pomelo/browser-records.js";
import { locksToRelease } from "../src/pomelo/browser/lock-release.js";

const lock = { profileId: "profile-1", jobId: "job-1" };
const job = { id: lock.jobId, profileId: lock.profileId, state: "done" } as const;
const otherLock = { ...lock, jobId: "job-2" };

for (const state of ["done", "failed", "cancelled"] as const) {
  test(`a ${state} job releases every lock it holds`, () => {
    const secondLock = { ...lock, profileId: "profile-2" };
    assert.deepEqual(locksToRelease({ job: { ...job, state }, locks: [lock, secondLock] }), {
      release: [
        { ...lock, reason: "job_ended" },
        { ...secondLock, reason: "job_ended" },
      ],
      keep: [],
      findings: [],
    });
  });
}

for (const [state, reason] of [["running", "job_running"], ["waiting", "waiting_for_amit"]] as const) {
  test(`a ${state} job keeps its profile lock`, () => {
    assert.deepEqual(locksToRelease({ job: { ...job, state }, locks: [lock] }), {
      release: [],
      keep: [{ ...lock, reason }],
      findings: [],
    });
  });
}

test("a queued job's lock is unexpected and kept for review", () => {
  assert.deepEqual(locksToRelease({ job: { ...job, state: "queued" }, locks: [lock] }), {
    release: [],
    keep: [{ ...lock, reason: "queued_job" }],
    findings: [{ ...lock, kind: "unexpected" }],
  });
});

test("a done job keeps another job's lock even on the same profile", () => {
  assert.deepEqual(locksToRelease({ job, locks: [otherLock] }), {
    release: [],
    keep: [{ ...otherLock, reason: "other_job" }],
    findings: [],
  });
});

test("both conflicting locks are kept while a separate owned lock is released", () => {
  const secondLock = { ...lock, profileId: "profile-2" };
  assert.deepEqual(locksToRelease({ job, locks: [lock, secondLock, otherLock] }), {
    release: [{ ...secondLock, reason: "job_ended" }],
    keep: [{ ...lock, reason: "conflict" }, { ...otherLock, reason: "conflict" }],
    findings: [{ kind: "conflict", profileId: lock.profileId }],
  });
});

test("a repeated lock under the same job also conflicts", () => {
  assert.deepEqual(locksToRelease({ job, locks: [lock, { ...lock }] }), {
    release: [],
    keep: [{ ...lock, reason: "conflict" }, { ...lock, reason: "conflict" }],
    findings: [{ kind: "conflict", profileId: lock.profileId }],
  });
});

test("a queued job's conflicting lock produces both findings", () => {
  const result = locksToRelease({ job: { ...job, state: "queued" }, locks: [otherLock, lock] });
  assert.deepEqual(result.release, []);
  assert.deepEqual(result.keep, [{ ...otherLock, reason: "conflict" }, { ...lock, reason: "conflict" }]);
  assert.deepEqual(result.findings, [
    { kind: "conflict", profileId: lock.profileId },
    { ...lock, kind: "unexpected" },
  ]);
});

test("an empty lock list gives empty results", () => {
  assert.deepEqual(locksToRelease({ job, locks: [] }), { release: [], keep: [], findings: [] });
});

test("an unrecognized state from a stored job keeps its lock", () => {
  const state = "unrecognized" as BrowserJobState;
  assert.deepEqual(locksToRelease({ job: { ...job, state }, locks: [lock] }), {
    release: [],
    keep: [{ ...lock, reason: "unknown_state" }],
    findings: [],
  });
});

test("the lock release check leaves its input unchanged", () => {
  const locks = Object.freeze([Object.freeze({ ...otherLock }), Object.freeze({ ...lock, profileId: "profile-2" })]);
  const input = Object.freeze({ job: Object.freeze({ ...job }), locks });
  locksToRelease(input);
  assert.deepEqual(input, { job, locks: [otherLock, { ...lock, profileId: "profile-2" }] });
});
