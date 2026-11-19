import assert from "node:assert/strict";
import { test } from "node:test";
import { laneShownState } from "../src/pomelo/lane-stall.js";

const minute = 60_000;
const lane = { status: "running", createdAt: 0 } as const;
const timing = { lastStepAt: 20 * minute, now: 21 * minute, askOpen: false };

test("a running lane with a recent step still shows running", () => {
  assert.deepEqual(laneShownState(lane, timing), { state: "running" });
});

test("an open ask shows waiting with whole quiet minutes even past the limit", () => {
  const now = timing.lastStepAt + 12 * minute + 45_000;
  assert.deepEqual(laneShownState(lane, { ...timing, now, askOpen: true }), {
    state: "waiting",
    quietMinutes: 12,
  });
});

test("an open ask shows waiting before a full minute of quiet", () => {
  const now = timing.lastStepAt + 30_000;
  assert.deepEqual(laneShownState(lane, { ...timing, now, askOpen: true }), {
    state: "waiting",
    quietMinutes: 0,
  });
});

test("a quiet lane without an open ask shows stuck immediately past the limit", () => {
  const now = timing.lastStepAt + 10 * minute + 1;
  assert.deepEqual(laneShownState(lane, { ...timing, now }), { state: "stuck", quietMinutes: 10 });
});

test("a lane without a step measures quiet time from creation", () => {
  const createdAt = 5 * minute;
  const now = createdAt + 13 * minute;
  assert.deepEqual(laneShownState({ ...lane, createdAt }, { now, askOpen: false }), {
    state: "stuck",
    quietMinutes: 13,
  });
});

test("a lane exactly at the quiet limit still shows running", () => {
  const now = timing.lastStepAt + 10 * minute;
  assert.deepEqual(laneShownState(lane, { ...timing, now }), { state: "running" });
});

test("terminal lanes keep their state regardless of quiet time and open asks", () => {
  for (const status of ["done", "failed", "cancelled"] as const) {
    const finishedLane = { ...lane, status, endedAt: timing.lastStepAt + 1 };
    const now = timing.lastStepAt + 60 * minute;
    assert.deepEqual(laneShownState(finishedLane, { ...timing, now }), { state: status });
    assert.deepEqual(laneShownState(finishedLane, { ...timing, now, askOpen: true }), { state: status });
  }
});

test("a clock before the last step shows running even with an open ask", () => {
  const now = timing.lastStepAt - 1;
  assert.deepEqual(laneShownState(lane, { ...timing, now }), { state: "running" });
  assert.deepEqual(laneShownState(lane, { ...timing, now, askOpen: true }), { state: "running" });
});

test("a custom quiet limit can make a lane stuck sooner", () => {
  assert.deepEqual(laneShownState(lane, { ...timing, quietLimitMs: minute - 1 }), {
    state: "stuck",
    quietMinutes: 1,
  });
});

test("the quiet limit must be a finite positive number", () => {
  for (const quietLimitMs of [0, -1, Infinity, NaN]) {
    assert.throws(
      () => laneShownState(lane, { ...timing, quietLimitMs }),
      { name: "RangeError", message: /quiet limit must be a finite positive number/i },
    );
  }
});
