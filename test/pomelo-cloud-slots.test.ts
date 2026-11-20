import assert from "node:assert/strict";
import test from "node:test";
import { pickCloudSlots, type CloudSlotJob } from "../src/pomelo/browser/cloud-slots.js";

const limits = { maxRunning: 2, maxPerThread: 2 };

function job(id: string, queuedAt: number, overrides: Partial<CloudSlotJob> = {}): CloudSlotJob {
  return { id, queuedAt, profileId: id, threadId: id, state: "queued", ...overrides };
}

test("the two oldest jobs take the server slots", () => {
  const jobs = [job("newest", 3), job("oldest", 1), job("middle", 2)];
  assert.deepEqual(pickCloudSlots(jobs, limits), {
    start: ["oldest", "middle"],
    wait: [{ id: "newest", reason: "server-full" }],
  });
});

test("a running job already holds a server slot and its profile", () => {
  const jobs = [
    job("same-profile", 1, { profileId: "active" }),
    job("next", 2),
    job("last", 3),
    job("active", 0, { state: "running" }),
  ];
  assert.deepEqual(pickCloudSlots(jobs, limits), {
    start: ["next"],
    wait: [
      { id: "same-profile", reason: "profile-busy" },
      { id: "last", reason: "server-full" },
    ],
  });
});

test("the first job to start reserves its profile", () => {
  const jobs = [job("first", 1), job("second", 2, { profileId: "first" }), job("third", 3)];
  assert.deepEqual(pickCloudSlots(jobs, limits), {
    start: ["first", "third"],
    wait: [{ id: "second", reason: "profile-busy" }],
  });
});

test("a full thread waits while another thread can start", () => {
  const jobs = [
    job("active", 0, { threadId: "thread-a", state: "running" }),
    job("same-thread", 1, { threadId: "thread-a" }),
    job("other-thread", 2),
  ];
  assert.deepEqual(pickCloudSlots(jobs, { maxRunning: 2, maxPerThread: 1 }), {
    start: ["other-thread"],
    wait: [{ id: "same-thread", reason: "thread-full" }],
  });
});

test("a job selected to start counts toward its thread limit", () => {
  const jobs = [
    job("active", 0, { state: "running", threadId: "thread-a" }),
    job("first", 1, { threadId: "thread-a" }),
    job("second", 2, { threadId: "thread-a" }),
  ];
  assert.deepEqual(pickCloudSlots(jobs, { maxRunning: 3, maxPerThread: 2 }), {
    start: ["first"],
    wait: [{ id: "second", reason: "thread-full" }],
  });
});

test("a full server takes precedence when a thread and profile are also occupied", () => {
  const jobs = [
    job("first", 1),
    job("second", 2, { profileId: "first", threadId: "first" }),
  ];
  assert.deepEqual(pickCloudSlots(jobs, { maxRunning: 1, maxPerThread: 1 }), {
    start: ["first"],
    wait: [{ id: "second", reason: "server-full" }],
  });
  assert.deepEqual(pickCloudSlots(jobs, { maxRunning: 2, maxPerThread: 1 }), {
    start: ["first"],
    wait: [{ id: "second", reason: "thread-full" }],
  });
});

test("equal timestamps use id order even when the input is shuffled", () => {
  const a = Object.freeze(job("a", 1));
  const b = Object.freeze(job("b", 1));
  const c = Object.freeze(job("c", 1));
  const expected = { start: ["a", "b"], wait: [{ id: "c", reason: "server-full" }] };
  assert.deepEqual(pickCloudSlots(Object.freeze([c, b, a]), limits), expected);
  assert.deepEqual(pickCloudSlots(Object.freeze([b, a, c]), limits), expected);
});

test("waiting and terminal jobs leave slots and profiles free", () => {
  const jobs = [
    job("paused", 1, { state: "waiting", profileId: "next", threadId: "next" }),
    job("finished", 2, { state: "done" }),
    job("errored", 3, { state: "failed" }),
    job("stopped", 4, { state: "cancelled" }),
    job("next", 5),
  ];
  assert.deepEqual(pickCloudSlots(jobs, { maxRunning: 1, maxPerThread: 1 }), {
    start: ["next"],
    wait: [],
  });
});

test("PC jobs use neither server slots nor cloud profiles", () => {
  const jobs = [
    job("pc-running", 0, { runner: "pc", state: "running", profileId: "cloud", threadId: "cloud" }),
    job("pc-queued", 1, { runner: "pc" }),
    job("cloud", 2, { runner: "cloud" }),
  ];
  assert.deepEqual(pickCloudSlots(jobs, { maxRunning: 1, maxPerThread: 1 }), {
    start: ["cloud"],
    wait: [],
  });
});

test("an invalid server limit defaults to one", () => {
  const jobs = [job("first", 1), job("second", 2)];
  for (const maxRunning of [0, -1, 1.5, NaN, Infinity, "2", undefined]) {
    assert.deepEqual(pickCloudSlots(jobs, { ...limits, maxRunning }), {
      start: ["first"],
      wait: [{ id: "second", reason: "server-full" }],
    });
  }
});

test("invalid input yields no decisions", () => {
  const empty = { start: [], wait: [] };
  const next = job("next", 1);
  assert.deepEqual(pickCloudSlots({ next }, limits), empty);
  assert.deepEqual(pickCloudSlots([next, null], limits), empty);
  assert.deepEqual(pickCloudSlots([next, job("bad-time", NaN)], limits), empty);
  assert.deepEqual(pickCloudSlots([next, job("next", 2)], limits), empty);
  assert.deepEqual(pickCloudSlots([next], null), empty);
  assert.deepEqual(pickCloudSlots([next], { ...limits, maxPerThread: 0 }), empty);
});

test("an unreadable job yields no decisions", () => {
  const unreadable = {
    ...job("unreadable", 2),
    get state() {
      throw new Error("unreadable state");
    },
  };
  assert.deepEqual(pickCloudSlots([job("next", 1), unreadable], limits), { start: [], wait: [] });
});
