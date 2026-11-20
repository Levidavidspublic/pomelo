import assert from "node:assert/strict";
import test from "node:test";
import { WAIT_REASONS, waitingJobs } from "../src/client/pomelo/waiting-jobs.js";

function job(id: string, fields: Record<string, unknown> = {}) {
  return { id, threadId: `thread-${id}`, profileId: "profile", state: "waiting", ...fields };
}

test("an empty list has no waiting jobs", () => {
  assert.deepEqual(waitingJobs([]), { total: 0, byThread: {}, groups: [] });
});

test("only waiting jobs count toward the home and rail totals", () => {
  const jobs = ["queued", "running", "done", "failed", "cancelled"].map((state) => job(state, { state }));
  const summary = waitingJobs([...jobs, job("waiting", { waitReason: "approval" })]);

  assert.equal(summary.total, 1);
  assert.deepEqual(summary.byThread, { "thread-waiting": 1 });
  assert.deepEqual(summary.groups.map(({ reason, count, threadIds }) => ({ reason, count, threadIds })), [
    { reason: "approval", count: 1, threadIds: ["thread-waiting"] },
  ]);
});

test("reason groups always follow the display order and use plain labels", () => {
  const expected = [
    { reason: "approval", label: "Approval needed" },
    { reason: "vault-locked", label: "Unlock 1Password" },
    { reason: "captcha", label: "Complete the CAPTCHA" },
    { reason: "vps-unreachable", label: "VPS not reachable" },
    { reason: "budget", label: "Review the job budget" },
    { reason: "other", label: "Needs you" },
  ];
  const summary = waitingJobs([...expected].reverse().map(({ reason }) => job(reason, { waitReason: reason })));

  assert.deepEqual(WAIT_REASONS, expected);
  assert.deepEqual(summary.groups.map(({ reason, label }) => ({ reason, label })), expected);
});

test("oldest waits lead each group and a thread is linked only once per reason", () => {
  const summary = waitingJobs([
    job("undated", { waitReason: "approval" }),
    job("newer", { waitReason: "approval", waitingSince: 30, threadId: "shared" }),
    job("middle", { waitReason: "approval", waitingSince: 20 }),
    job("oldest", { waitReason: "approval", waitingSince: 10, threadId: "shared" }),
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.byThread.shared, 2);
  assert.equal(summary.groups[0].count, 4);
  assert.deepEqual(summary.groups[0].jobs.map(({ id }) => id), ["oldest", "middle", "newer", "undated"]);
  assert.deepEqual(summary.groups[0].threadIds, ["shared", "thread-middle", "thread-undated"]);
});

test("unknown and missing reasons share the Needs you group", () => {
  const summary = waitingJobs([job("unknown", { waitReason: "unlisted" }), job("missing")]);

  assert.equal(summary.groups.length, 1);
  const [{ reason, label, count, threadIds }] = summary.groups;
  assert.deepEqual({ reason, label, count, threadIds }, {
    reason: "other",
    label: "Needs you",
    count: 2,
    threadIds: ["thread-unknown", "thread-missing"],
  });
});

test("existing hold-card reasons map to the matching summary labels", () => {
  const summary = waitingJobs([
    job("vault", { waitReason: "vault_locked" }),
    job("vps", { waitReason: "cloud_unreachable" }),
  ]);

  assert.deepEqual(summary.groups.map(({ reason, label }) => ({ reason, label })), [
    { reason: "vault-locked", label: "Unlock 1Password" },
    { reason: "vps-unreachable", label: "VPS not reachable" },
  ]);
});

test("the VPS badge belongs to each job, even within one thread", () => {
  const summary = waitingJobs([
    job("cloud", { threadId: "shared", location: "cloud" }),
    job("local", { threadId: "shared", location: "local" }),
    job("unspecified", { threadId: "shared" }),
  ]);

  assert.deepEqual(summary.groups[0].jobs, [
    { id: "cloud", threadId: "shared", vps: true },
    { id: "local", threadId: "shared", vps: false },
    { id: "unspecified", threadId: "shared", vps: false },
  ]);
});

test("the summary leaves step text, locks, and extra fields out of its output", () => {
  const canary = ["fixture", "canary", "value"].join("-");
  const summary = waitingJobs([
    job("safe", {
      steps: [{ text: canary }],
      resourceLock: canary,
      extra: canary,
      waitReason: canary,
    }),
  ]);

  assert.equal(summary.total, 1);
  assert.equal(summary.groups[0].reason, "other");
  const serialized = JSON.stringify(summary);
  for (const excluded of [canary, '"steps"', '"resourceLock"', '"extra"']) {
    assert.equal(serialized.includes(excluded), false);
  }
});

test("non-array input and malformed rows are ignored", () => {
  for (const input of [null, undefined, "waiting", job("single")]) {
    assert.deepEqual(waitingJobs(input), waitingJobs([]));
  }

  const valid = job("valid");
  assert.deepEqual(waitingJobs([null, "waiting", 42, true, [], {}, job("invalid", { threadId: {} }), valid]),
    waitingJobs([valid]));
});

test("building the summary leaves the input unchanged", () => {
  const jobs = Object.freeze([
    Object.freeze(job("newer", { waitReason: "approval", waitingSince: 20 })),
    Object.freeze(job("older", { waitReason: "approval", waitingSince: 10 })),
  ]);
  const before = structuredClone(jobs);

  waitingJobs(jobs);

  assert.deepEqual(jobs, before);
});
