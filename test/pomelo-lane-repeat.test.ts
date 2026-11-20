import assert from "node:assert/strict";
import test from "node:test";
import { checkSpawnRepeat, SPAWN_REPEAT_WINDOW_MS } from "../src/pomelo/lane-repeat.js";

const call = {
  parentThreadId: "thread-1",
  spawnedBy: "agent-1",
  purpose: "Draft a ticket",
  now: 1_000_000,
};

const runningLane = {
  threadId: call.parentThreadId,
  laneId: "lane-1",
  spawnedBy: call.spawnedBy,
  purpose: call.purpose,
  status: "running" as const,
  createdAt: call.now - 1_000,
};

test("a recent running lane for the same thread, spawner and purpose is reused", () => {
  const result = checkSpawnRepeat(call, [runningLane]);
  assert.equal(result.repeat, true);
  if (result.repeat) {
    assert.equal(result.laneId, runningLane.laneId);
    assert.ok(result.reason.trim());
    assert.ok(!result.reason.toLowerCase().includes(call.purpose.toLowerCase()));
  }
});

test("a matching queued lane can also be reused", () => {
  assert.equal(checkSpawnRepeat(call, [{ ...runningLane, status: "queued" }]).repeat, true);
});

test("the repeat window includes both endpoints and expires after two minutes", () => {
  assert.equal(SPAWN_REPEAT_WINDOW_MS, 120_000);
  for (const age of [0, SPAWN_REPEAT_WINDOW_MS]) {
    const lane = { ...runningLane, createdAt: call.now - age };
    assert.equal(checkSpawnRepeat(call, [lane]).repeat, true);
  }
  const retry = { ...call, now: runningLane.createdAt + SPAWN_REPEAT_WINDOW_MS + 1 };
  assert.deepEqual(checkSpawnRepeat(retry, [runningLane]), { repeat: false });
});

test("the caller can override the repeat window", () => {
  assert.equal(checkSpawnRepeat(call, [runningLane], { windowMs: 1_000 }).repeat, true);
  assert.deepEqual(checkSpawnRepeat(call, [runningLane], { windowMs: 999 }), { repeat: false });
});

test("a different thread, spawner or purpose needs a new lane", () => {
  for (const distinct of [
    { ...call, parentThreadId: "thread-2" },
    { ...call, spawnedBy: "agent-2" },
    { ...call, purpose: "Review a ticket" },
  ]) {
    assert.deepEqual(checkSpawnRepeat(distinct, [runningLane]), { repeat: false });
  }
});

test("done, failed and cancelled lanes are never reused", () => {
  for (const status of ["done", "failed", "cancelled"] as const) {
    assert.deepEqual(checkSpawnRepeat(call, [{ ...runningLane, status }]), { repeat: false });
  }
});

test("purpose matching ignores case and outer spaces", () => {
  const retry = { ...call, purpose: "  DRAFT a ticket  " };
  const lane = { ...runningLane, purpose: " Draft a Ticket " };
  assert.equal(checkSpawnRepeat(retry, [lane]).repeat, true);
});

test("Hebrew purposes match the same text and distinguish different text", () => {
  const lane = { ...runningLane, purpose: "לכתוב בדיקה" };
  assert.equal(checkSpawnRepeat({ ...call, purpose: "  לכתוב בדיקה  " }, [lane]).repeat, true);
  assert.deepEqual(checkSpawnRepeat({ ...call, purpose: "לקרוא בדיקה" }, [lane]), { repeat: false });
});

test("the newest matching active lane is reused regardless of input order", () => {
  const newer = { ...runningLane, laneId: "lane-2", createdAt: call.now - 500 };
  const finished = { ...runningLane, laneId: "lane-3", createdAt: call.now - 100, status: "done" as const };
  for (const lanes of [[runningLane, newer, finished], [finished, newer, runningLane]]) {
    const result = checkSpawnRepeat(call, Object.freeze(lanes));
    assert.equal(result.repeat && result.laneId, newer.laneId);
  }
});

test("an empty lane list needs a new lane", () => {
  assert.deepEqual(checkSpawnRepeat(call, []), { repeat: false });
});

test("missing or invalid times do not produce a match", () => {
  for (const time of [undefined, NaN, Infinity, -1, "999000"] as (number | undefined)[]) {
    assert.deepEqual(checkSpawnRepeat({ ...call, now: time }, [runningLane]), { repeat: false });
    assert.deepEqual(checkSpawnRepeat(call, [{ ...runningLane, createdAt: time }]), { repeat: false });
  }
});

test("a lane created after the call is ignored", () => {
  const future = { ...runningLane, createdAt: call.now + 1 };
  assert.deepEqual(checkSpawnRepeat(call, [future]), { repeat: false });
});
