import assert from "node:assert/strict";
import test from "node:test";
import { applyLaneEvent, emptyLaneState, runningCount, type LaneEvent } from "../src/client/pomelo/lane-update.js";

const started = {
  type: "lane-started",
  threadId: "thread-a",
  laneId: "lane-a",
  at: 10,
  purpose: "  בדיקת דוגמה 🧪  ",
} satisfies LaneEvent;
const { threadId, laneId } = started;
const step = { type: "lane-step", threadId, laneId, at: 20 } satisfies LaneEvent;
const waiting = { type: "lane-waiting", threadId, laneId, at: 30 } satisfies LaneEvent;

test("a start adds one running row and preserves the supplied purpose", () => {
  const empty = emptyLaneState();
  const state = applyLaneEvent(empty, started);

  assert.equal(runningCount(empty, threadId), 0);
  assert.equal(runningCount(state, threadId), 1);
  assert.equal(state.get(threadId)?.lanes.size, 1);
  assert.deepEqual(state.get(threadId)?.lanes.get(laneId), {
    threadId, laneId, status: "running", lastEventAt: 10, purpose: started.purpose,
  });
});

test("a repeat start for the same lane returns the same state", () => {
  const state = applyLaneEvent(emptyLaneState(), started);
  assert.equal(applyLaneEvent(state, { ...started, at: 40, purpose: "Other purpose" }), state);
});

test("a step records its time while the lane stays running", () => {
  const state = applyLaneEvent(applyLaneEvent(emptyLaneState(), started), step);
  assert.equal(state.get(threadId)?.lanes.get(laneId)?.lastStepAt, 20);
  assert.equal(runningCount(state, threadId), 1);
  assert.equal(applyLaneEvent(state, step), state);
});

test("waiting keeps the row and clears the running badge count", () => {
  const working = applyLaneEvent(applyLaneEvent(emptyLaneState(), started), step);
  const state = applyLaneEvent(working, waiting);
  assert.equal(runningCount(state, threadId), 0);
  assert.equal(state.get(threadId)?.lanes.size, 1);
  assert.equal(state.get(threadId)?.lanes.get(laneId)?.status, "waiting");
  assert.equal(state.get(threadId)?.lanes.get(laneId)?.lastStepAt, 20);

  const withStep = applyLaneEvent(state, { ...step, at: 35 });
  assert.equal(runningCount(withStep, threadId), 0);
  assert.equal(withStep.get(threadId)?.lanes.get(laneId)?.status, "waiting");
  assert.equal(withStep.get(threadId)?.lanes.get(laneId)?.lastStepAt, 35);
});

test("each terminal status is final, including done after waiting", () => {
  const active = applyLaneEvent(applyLaneEvent(emptyLaneState(), started), waiting);
  for (const [type, status] of [
    ["lane-done", "done"],
    ["lane-failed", "failed"],
    ["lane-cancelled", "cancelled"],
  ] as const) {
    const state = applyLaneEvent(active, { type, threadId, laneId, at: 40 });
    assert.equal(state.get(threadId)?.lanes.size, 1);
    assert.equal(state.get(threadId)?.lanes.get(laneId)?.status, status);
    assert.equal(runningCount(state, threadId), 0);
    assert.equal(applyLaneEvent(state, { ...step, at: 50 }), state);
    assert.equal(applyLaneEvent(state, { ...started, at: 60 }), state);
    assert.equal(applyLaneEvent(state, { ...waiting, at: 70 }), state);
    assert.equal(applyLaneEvent(state, { type: "lane-failed", threadId, laneId, at: 80 }), state);
  }
});

test("an older event is ignored and an event at the same time may change status", () => {
  const state = applyLaneEvent(applyLaneEvent(emptyLaneState(), started), waiting);
  assert.equal(applyLaneEvent(state, step), state);
  assert.equal(applyLaneEvent(state, { type: "lane-done", threadId, laneId, at: 29 }), state);
  const done = applyLaneEvent(state, { type: "lane-done", threadId, laneId, at: 30 });
  assert.equal(done.get(threadId)?.lanes.get(laneId)?.status, "done");
});

test("events for never-started lanes keep minimal rows in their reported states", () => {
  const waitingFirst = applyLaneEvent(emptyLaneState(), waiting);
  assert.equal(waitingFirst.get(threadId)?.lanes.size, 1);
  assert.deepEqual(waitingFirst.get(threadId)?.lanes.get(laneId), {
    threadId, laneId, status: "waiting", lastEventAt: 30,
  });
  assert.equal(runningCount(waitingFirst, threadId), 0);
  assert.equal(applyLaneEvent(waitingFirst, started), waitingFirst);

  const stepFirst = applyLaneEvent(emptyLaneState(), step);
  assert.deepEqual(stepFirst.get(threadId)?.lanes.get(laneId), {
    threadId, laneId, status: "running", lastEventAt: 20, lastStepAt: 20,
  });
  assert.equal(runningCount(stepFirst, threadId), 1);

  const doneFirst = applyLaneEvent(emptyLaneState(), { type: "lane-done", threadId, laneId, at: 40 });
  assert.deepEqual(doneFirst.get(threadId)?.lanes.get(laneId), {
    threadId, laneId, status: "done", lastEventAt: 40,
  });
  assert.equal(runningCount(doneFirst, threadId), 0);
});

test("two threads keep separate counts even when their lane ids match", () => {
  const otherThread = "thread-b";
  const state = applyLaneEvent(applyLaneEvent(emptyLaneState(), started), { ...started, threadId: otherThread });
  assert.equal(runningCount(state, threadId), 1);
  assert.equal(runningCount(state, otherThread), 1);

  const next = applyLaneEvent(state, waiting);
  assert.equal(runningCount(next, threadId), 0);
  assert.equal(runningCount(next, otherThread), 1);
  assert.equal(next.get(otherThread), state.get(otherThread));
});

test("cancelling one of two running lanes leaves the other running", () => {
  const state = applyLaneEvent(applyLaneEvent(emptyLaneState(), started), { ...started, laneId: "lane-b" });
  assert.equal(runningCount(state, threadId), 2);
  const next = applyLaneEvent(state, { type: "lane-cancelled", threadId, laneId, at: 20 });
  assert.equal(runningCount(next, threadId), 1);
  assert.equal(next.get(threadId)?.lanes.size, 2);
  assert.equal(next.get(threadId)?.lanes.get(laneId)?.status, "cancelled");
  assert.equal(next.get(threadId)?.lanes.get("lane-b"), state.get(threadId)?.lanes.get("lane-b"));
});

test("a 500-character Hebrew and emoji purpose is capped without splitting the emoji", () => {
  const prefix = "א".repeat(199) + "🧪";
  const purpose = prefix + "ב".repeat(300);
  const state = applyLaneEvent(emptyLaneState(), { ...started, purpose });
  assert.equal(state.get(threadId)?.lanes.get(laneId)?.purpose, prefix);
  assert.equal([...prefix].length, 200);
});

test("updating a frozen state and event leaves the inputs intact", () => {
  const state = Object.freeze(applyLaneEvent(emptyLaneState(), started));
  const thread = state.get(threadId)!;
  const row = thread.lanes.get(laneId)!;
  Object.freeze(thread);
  Object.freeze(thread.lanes);
  Object.freeze(row);

  const next = applyLaneEvent(state, Object.freeze(waiting));
  assert.notEqual(next, state);
  assert.notEqual(next.get(threadId)?.lanes, thread.lanes);
  assert.equal(next.get(threadId)?.lanes.get(laneId)?.status, "waiting");
  assert.equal(runningCount(state, threadId), 1);
  assert.equal(state.get(threadId), thread);
  assert.equal(thread.lanes.get(laneId), row);
  assert.equal(row.status, "running");
  assert.equal(row.lastEventAt, 10);
});
