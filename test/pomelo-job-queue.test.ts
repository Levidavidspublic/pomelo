import assert from "node:assert/strict";
import test from "node:test";
import { pickNextJobs } from "../src/pomelo/browser/job-queue.js";

type Job = Parameters<typeof pickNextJobs>[0][number];

function job(id: string, profileId: string, state: Job["state"] = "queued", resourceLock: string | null = null): Job {
  return { id, profileId, state, resourceLock };
}

test("an empty queue has no jobs to start or hold", () => {
  assert.deepEqual(pickNextJobs([]), { start: [], held: [] });
});

test("a queued job on a free profile can start", () => {
  assert.deepEqual(pickNextJobs([job("first", "local")]), { start: ["first"], held: [] });
});

test("only the oldest queued job can start on the same free profile", () => {
  const jobs = [job("first", "local"), job("second", "local")];
  assert.deepEqual(pickNextJobs(jobs), {
    start: ["first"],
    held: [{ id: "second", heldBy: "first" }],
  });
});

test("queued jobs on different free profiles can both start in queue order", () => {
  const jobs = [job("older", "local"), job("newer", "cloud")];
  assert.deepEqual(pickNextJobs(jobs), { start: ["older", "newer"], held: [] });
});

test("a running job holds its profile even when it appears later in the list", () => {
  const jobs = [job("queued", "local"), job("active", "local", "running")];
  assert.deepEqual(pickNextJobs(jobs), {
    start: [],
    held: [{ id: "queued", heldBy: "active" }],
  });
});

test("a waiting job still holds its profile", () => {
  const jobs = [job("paused", "local", "waiting"), job("queued", "local")];
  assert.deepEqual(pickNextJobs(jobs), {
    start: [],
    held: [{ id: "queued", heldBy: "paused" }],
  });
});

test("a lock holds the named profile and identifies its holder", () => {
  const jobs = [
    job("queued-cloud", "cloud"),
    job("running-cloud", "cloud", "running"),
    job("lock-owner", "local", "waiting", "cloud"),
    job("queued-local", "local"),
  ];
  assert.deepEqual(pickNextJobs(jobs), {
    start: [],
    held: [
      { id: "queued-cloud", heldBy: "lock-owner" },
      { id: "queued-local", heldBy: "lock-owner" },
    ],
  });
});

test("an explicit lock holds its profile regardless of the holder's queued state", () => {
  const jobs = [job("queued-cloud", "cloud"), job("lock-owner", "local", "queued", "cloud")];
  assert.deepEqual(pickNextJobs(jobs), {
    start: ["lock-owner"],
    held: [{ id: "queued-cloud", heldBy: "lock-owner" }],
  });
});

test("done, failed and cancelled jobs are skipped even with stale locks", () => {
  const jobs = [
    job("finished", "local", "done", "local"),
    job("errored", "local", "failed", "local"),
    job("stopped", "local", "cancelled", "local"),
    job("next", "local"),
  ];
  assert.deepEqual(pickNextJobs(jobs), { start: ["next"], held: [] });
});

test("interleaved jobs stay in queue order within each result", () => {
  const jobs = [
    job("local-first", "local"),
    job("cloud-first", "cloud"),
    job("local-second", "local"),
    job("spare-first", "spare"),
    job("cloud-second", "cloud"),
    job("cloud-active", "cloud", "running", "cloud"),
  ];
  assert.deepEqual(pickNextJobs(jobs), {
    start: ["local-first", "spare-first"],
    held: [
      { id: "cloud-first", heldBy: "cloud-active" },
      { id: "local-second", heldBy: "local-first" },
      { id: "cloud-second", heldBy: "cloud-active" },
    ],
  });
});

test("picking jobs leaves the input list and rows unchanged", () => {
  const jobs = Object.freeze([Object.freeze(job("first", "local")), Object.freeze(job("second", "local"))]);
  pickNextJobs(jobs);
  assert.deepEqual(jobs, [job("first", "local"), job("second", "local")]);
});
