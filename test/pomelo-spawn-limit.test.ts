import assert from "node:assert/strict";
import { test } from "node:test";
import { canSpawn, SPAWN_LIMITS, type SpawnInput, type SpawnLane } from "../src/pomelo/spawn-limit.js";

const mainAgentId = "main";
const rootCall: SpawnInput = { mainAgentId, callerId: mainAgentId, lanes: [] };
const first: SpawnLane = { id: "first", spawnedBy: mainAgentId, status: "running" };
const second: SpawnLane = { id: "second", spawnedBy: first.id, status: "running" };

test("the main agent can spawn with no running lanes", () => {
  assert.deepEqual(SPAWN_LIMITS, { maxRunning: 4, maxDepth: 1 });
  assert.deepEqual(canSpawn(rootCall), { ok: true });
});

test("the running limit refuses a spawn when the thread is full", () => {
  const lanes = Array.from({ length: SPAWN_LIMITS.maxRunning }, (_, i) => ({ ...first, id: `lane-${i}` }));

  assert.deepEqual(canSpawn({ ...rootCall, lanes: lanes.slice(1) }), { ok: true });
  assert.deepEqual(canSpawn({ ...rootCall, lanes }), { ok: false, reason: "too_many_running" });
});

test("done, failed and cancelled lanes free running slots", () => {
  const lanes: SpawnLane[] = [
    first,
    { ...first, id: "done", status: "done" },
    { ...first, id: "failed", status: "failed" },
    { ...first, id: "cancelled", status: "cancelled" },
  ];

  assert.deepEqual(canSpawn({ ...rootCall, lanes, limits: { ...SPAWN_LIMITS, maxRunning: 2 } }), { ok: true });
});

test("the default depth refuses a spawn from a first-level lane", () => {
  assert.deepEqual(canSpawn({ ...rootCall, callerId: first.id, lanes: [first] }), {
    ok: false,
    reason: "too_deep",
  });
});

test("with maxDepth 2, only the first-level lane can spawn another lane", () => {
  const input = { ...rootCall, lanes: [second, first], limits: { ...SPAWN_LIMITS, maxDepth: 2 } };

  assert.deepEqual(canSpawn({ ...input, callerId: first.id }), { ok: true });
  assert.deepEqual(canSpawn({ ...input, callerId: second.id }), { ok: false, reason: "too_deep" });
});

test("a parent loop is invalid for both a lane in the loop and the main agent", () => {
  const lanes = [{ ...first, spawnedBy: second.id }, second];
  const limits = { maxRunning: 0, maxDepth: 0 };

  for (const callerId of [first.id, mainAgentId]) {
    assert.deepEqual(canSpawn({ ...rootCall, lanes, callerId, limits }), { ok: false, reason: "bad_input" });
  }
});

test("a missing parent anywhere in the chain is invalid", () => {
  const lanes = [second, { ...first, spawnedBy: "missing" }];

  assert.deepEqual(canSpawn({ ...rootCall, lanes, callerId: second.id }), { ok: false, reason: "bad_input" });
});

test("an unknown caller is invalid", () => {
  assert.deepEqual(canSpawn({ ...rootCall, lanes: [first], callerId: "missing" }), { ok: false, reason: "bad_input" });
});

test("duplicate IDs and IDs that collide with the main agent are invalid", () => {
  for (const lanes of [[first, { ...first }], [{ ...first, id: mainAgentId }]]) {
    assert.deepEqual(canSpawn({ ...rootCall, lanes }), { ok: false, reason: "bad_input" });
  }
});

test("negative and non-integer limits are invalid", () => {
  for (const value of [-1, 1.5, Infinity, NaN]) {
    for (const key of ["maxRunning", "maxDepth"] as const) {
      const limits = { ...SPAWN_LIMITS, [key]: value };
      assert.deepEqual(canSpawn({ ...rootCall, limits }), { ok: false, reason: "bad_input" });
    }
  }
});

test("zero limits are valid and can disable spawning", () => {
  assert.deepEqual(canSpawn({ ...rootCall, limits: { ...SPAWN_LIMITS, maxRunning: 0 } }), {
    ok: false,
    reason: "too_many_running",
  });
  assert.deepEqual(canSpawn({ ...rootCall, limits: { ...SPAWN_LIMITS, maxDepth: 0 } }), {
    ok: false,
    reason: "too_deep",
  });
});
