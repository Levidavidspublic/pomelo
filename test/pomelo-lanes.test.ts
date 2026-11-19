import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localKV } from "../src/local/kv.js";
import { createLane, listLanes, runningCount, setLaneStatus } from "../src/pomelo/lanes.js";
import { pomeloStore } from "../src/pomelo/store.js";

const lane = {
  threadId: "thread",
  laneId: "worker",
  spawnedBy: "agent:parent",
  purpose: "Draft a summary",
  createdAt: 100,
};

async function rig(t: test.TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-lanes-"));
  const kv = await localKV(home, 60_000);
  t.after(async () => {
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  return { redis: kv.redis, store: pomeloStore(kv.redis) };
}

test("a lane starts running and a duplicate leaves its original record intact", async (t) => {
  const { redis, store } = await rig(t);
  const request = { ...lane, prompt: "Draft the summary", output: "Sample output" };
  await createLane(store, request);
  await assert.rejects(createLane(store, { ...lane, purpose: "Draft an outline" }), /already exists/i);

  const record = { ...lane, status: "running" };
  assert.deepEqual(await listLanes(store, lane.threadId), [record]);
  assert.deepEqual(JSON.parse((await redis.get("pomelo:lane:thread:worker"))!), record);
});

test("running lanes can finish once and retain their final status and end time", async (t) => {
  const { store } = await rig(t);
  const statuses = ["done", "failed", "cancelled"] as const;
  for (const status of statuses) {
    const input = { ...lane, laneId: status };
    await createLane(store, input);
    await setLaneStatus(store, input.threadId, input.laneId, status, 200);
    for (const next of ["running", ...statuses] as const) {
      await assert.rejects(setLaneStatus(store, input.threadId, input.laneId, next, 300));
    }
  }

  assert.deepEqual(await listLanes(store, lane.threadId), ["cancelled", "done", "failed"].map((status) => ({
    ...lane, laneId: status, status, endedAt: 200,
  })));
});

test("only one simultaneous completion succeeds across store wrappers", async (t) => {
  const { redis, store } = await rig(t);
  await createLane(store, lane);

  const results = await Promise.allSettled([
    setLaneStatus(store, lane.threadId, lane.laneId, "done", 200),
    setLaneStatus(pomeloStore(redis), lane.threadId, lane.laneId, "cancelled", 300),
  ]);
  assert.deepEqual(results.map(({ status }) => status), ["fulfilled", "rejected"]);
  assert.deepEqual(await listLanes(store, lane.threadId), [{ ...lane, status: "done", endedAt: 200 }]);
});

test("running count includes only running lanes in the exact thread", async (t) => {
  const { store } = await rig(t);
  await createLane(store, lane);
  await createLane(store, { ...lane, laneId: "second" });
  await createLane(store, { ...lane, laneId: "finished" });
  await createLane(store, { ...lane, threadId: "thread-other" });
  await setLaneStatus(store, lane.threadId, "finished", "failed", 200);

  assert.equal(await runningCount(store, lane.threadId), 2);
  assert.equal(await runningCount(store, "thread-other"), 1);
  assert.equal(await runningCount(store, "missing"), 0);
});

test("purpose must contain between 1 and 120 characters after trimming", async (t) => {
  const { store } = await rig(t);
  await assert.rejects(createLane(store, { ...lane, purpose: " \t " }), /purpose/i);
  await assert.rejects(createLane(store, { ...lane, purpose: "🧭".repeat(121) }), /purpose/i);
  assert.deepEqual(await listLanes(store, lane.threadId), []);

  const purpose = "🧭".repeat(120);
  await createLane(store, { ...lane, purpose: ` ${purpose} ` });
  assert.deepEqual(await listLanes(store, lane.threadId), [{ ...lane, purpose, status: "running" }]);
});

test("lane operations refuse colon-delimited ids", async (t) => {
  const { store } = await rig(t);
  await assert.rejects(createLane(store, { ...lane, threadId: "thread:other" }), /thread id/i);
  await assert.rejects(createLane(store, { ...lane, laneId: "worker:other" }), /lane id/i);
  await assert.rejects(setLaneStatus(store, "thread:other", lane.laneId, "done", 200), /thread id/i);
  await assert.rejects(setLaneStatus(store, lane.threadId, "worker:other", "done", 200), /lane id/i);
  await assert.rejects(listLanes(store, "thread:other"), /thread id/i);
  await assert.rejects(runningCount(store, "thread:other"), /thread id/i);
  assert.deepEqual(await listLanes(store, lane.threadId), []);
});

test("status updates require an existing lane and a terminal destination", async (t) => {
  const { store } = await rig(t);
  await assert.rejects(setLaneStatus(store, lane.threadId, lane.laneId, "done", 200), /does not exist/i);
  await createLane(store, lane);
  await assert.rejects(setLaneStatus(store, lane.threadId, lane.laneId, "running", 200), /status/i);
  assert.deepEqual(await listLanes(store, lane.threadId), [{ ...lane, status: "running" }]);
});
