import assert from "node:assert/strict";
import test from "node:test";
import { laneStop } from "../src/pomelo/lane-stop.js";

const now = 200;
const parent = { laneId: "parent", spawnedBy: "main", status: "running" } as const;
const child = { laneId: "child", spawnedBy: "parent", status: "running" } as const;
const other = { laneId: "other", spawnedBy: "main", status: "running" } as const;

test("stopping one running lane returns only its cancellation and end time", () => {
  assert.deepEqual(laneStop([parent, other], { kind: "lane", laneId: "parent" }, now), {
    changes: [{ laneId: "parent", status: "cancelled", endedAt: now }],
  });
});

test("stopping a finished lane returns its reason and no changes", () => {
  for (const status of ["done", "failed", "cancelled"] as const) {
    const finished = { ...parent, status, endedAt: 100 };
    const result = laneStop([finished, child], { kind: "lane", laneId: "parent" }, now);
    assert.deepEqual(result.changes, []);
    assert.match(result.reason ?? "", /already finished/i);
  }
});

test("stopping a lane follows running descendants and sorts changes by lane ID", () => {
  const grandchild = { laneId: "branch", spawnedBy: "child", status: "running" } as const;
  const finishedChild = { ...child, laneId: "finished", status: "done", endedAt: 100 } as const;
  const activeUnderFinished = { ...grandchild, laneId: "active", spawnedBy: "finished" };
  assert.deepEqual(
    laneStop(
      [child, other, parent, finishedChild, activeUnderFinished, grandchild],
      { kind: "lane", laneId: "parent" },
      now,
    ),
    {
      changes: [
        { laneId: "branch", status: "cancelled", endedAt: now },
        { laneId: "child", status: "cancelled", endedAt: now },
        { laneId: "parent", status: "cancelled", endedAt: now },
      ],
    },
  );
});

test("stopping a thread cancels only running lanes, regardless of who spawned them", () => {
  const lanes = [
    parent,
    { laneId: "done", spawnedBy: "main", status: "done", endedAt: 100 },
    { laneId: "failed", spawnedBy: "main", status: "failed", endedAt: 110 },
    { ...other, spawnedBy: "done" },
    { laneId: "cancelled", spawnedBy: "main", status: "cancelled", endedAt: 120 },
  ] as const;
  assert.deepEqual(laneStop(lanes, { kind: "thread" }, now), {
    changes: [
      { laneId: "other", status: "cancelled", endedAt: now },
      { laneId: "parent", status: "cancelled", endedAt: now },
    ],
  });
});

test("an unknown lane ID returns a reason and no changes", () => {
  const orphan = { ...child, spawnedBy: "missing" };
  const result = laneStop([parent, orphan], { kind: "lane", laneId: "missing" }, now);
  assert.deepEqual(result.changes, []);
  assert.match(result.reason ?? "", /unknown lane/i);
});

test("stopping an empty thread returns no changes", () => {
  assert.deepEqual(laneStop([], { kind: "thread" }, now), { changes: [] });
});

test("stopping lanes leaves the input list and records intact", () => {
  const lanes = Object.freeze([
    Object.freeze({ ...parent }),
    Object.freeze({ ...child, status: "done" as const, endedAt: 100 }),
  ]);
  const before = lanes.map((lane) => ({ ...lane }));

  laneStop(lanes, { kind: "lane", laneId: "parent" }, now);
  laneStop(lanes, { kind: "thread" }, now);

  assert.deepEqual(lanes, before);
});

test("a spawnedBy cycle stops each running lane once", () => {
  const lanes = [{ ...parent, spawnedBy: "child" }, child];
  assert.deepEqual(laneStop(lanes, { kind: "lane", laneId: "parent" }, now), {
    changes: [
      { laneId: "child", status: "cancelled", endedAt: now },
      { laneId: "parent", status: "cancelled", endedAt: now },
    ],
  });
});
