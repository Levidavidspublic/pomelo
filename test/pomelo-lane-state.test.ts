import assert from "node:assert/strict";
import { test } from "node:test";
import { isFinalLaneStatus, LANE_STATUSES, laneMove } from "../src/pomelo/lane-state.js";

const statuses = ["running", "waiting", "stuck", "done", "failed", "cancelled"] as const;
type Status = (typeof statuses)[number];
const finalStatuses: readonly Status[] = ["done", "failed", "cancelled"];

const allowed: Record<Status, readonly Status[]> = {
  running: ["waiting", "stuck", "done", "failed", "cancelled"],
  waiting: ["running", "done", "failed", "cancelled"],
  stuck: ["running", "done", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: [],
};

test("lists the six lane statuses and identifies the three final statuses", () => {
  assert.deepEqual(LANE_STATUSES, statuses);
  for (const status of statuses) {
    assert.equal(isFinalLaneStatus(status), finalStatuses.includes(status), status);
  }
  assert.equal(isFinalLaneStatus("stopped"), false);
});

test("checks all 36 lane status pairs", () => {
  for (const from of statuses) {
    for (const to of statuses) {
      const result = laneMove({ status: from, changedAt: 10 }, { status: to, at: 11 });
      const move = `${from} -> ${to}`;
      if (from === to) {
        assert.deepEqual(result, { ok: true, noop: true, reason: "noop" }, move);
      } else if (allowed[from].includes(to)) {
        assert.deepEqual(result, { ok: true, noop: false, reason: "allowed" }, move);
      } else {
        const reason = finalStatuses.includes(from) ? "final-status" : "invalid-transition";
        assert.deepEqual(result, { ok: false, noop: false, reason }, move);
      }
    }
  }
});

test("unknown statuses on either side get a fixed reason", () => {
  const current = { status: "running", changedAt: 10 };
  const next = { status: "done", at: 11 };
  const refused = { ok: false, noop: false, reason: "unknown-status" };
  for (const status of ["unrecognized status", "constructor", "__proto__", undefined, 7]) {
    assert.deepEqual(laneMove({ ...current, status }, next), refused);
    assert.deepEqual(laneMove(current, { ...next, status }), refused);
    assert.deepEqual(laneMove({ ...current, status }, { ...next, status }), refused);
  }
});

test("refuses older events, including a running event arriving after cancellation", () => {
  const refused = { ok: false, noop: false, reason: "late-event" };
  assert.deepEqual(laneMove({ status: "cancelled", changedAt: 10 }, { status: "running", at: 9 }), refused);
  assert.deepEqual(laneMove({ status: "waiting", changedAt: 10 }, { status: "running", at: 9 }), refused);
  assert.deepEqual(laneMove({ status: "running", changedAt: 10 }, { status: "running", at: 9 }), refused);
});

test("refuses missing or invalid times on either side, even for a repeat", () => {
  const current = { status: "running", changedAt: 10 };
  const next = { status: "running", at: 11 };
  const refused = { ok: false, noop: false, reason: "invalid-time" };
  assert.deepEqual(laneMove({ status: "running" }, next), refused);
  assert.deepEqual(laneMove(current, { status: "waiting" }), refused);
  for (const time of ["10", null, NaN, Infinity, -Infinity]) {
    assert.deepEqual(laneMove({ ...current, changedAt: time }, next), refused);
    assert.deepEqual(laneMove(current, { ...next, at: time }), refused);
  }
});

test("accepts an event at the last change time and leaves both inputs intact", () => {
  const current = Object.freeze({ status: "stuck", changedAt: 0 });
  const next = Object.freeze({ status: "running", at: 0 });
  assert.deepEqual(laneMove(current, next), { ok: true, noop: false, reason: "allowed" });
});
