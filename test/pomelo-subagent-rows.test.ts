import { test } from "node:test";
import assert from "node:assert/strict";
import { pomeloSubagentRows, pomeloSubagentTally, type LaneLike } from "../src/client/pomelo/subagent-rows.js";

function lane(laneId: string, fields: Partial<LaneLike> = {}): LaneLike {
  return {
    threadId: "thread-a",
    laneId,
    spawnedBy: "main",
    purpose: "Review the outline",
    status: "running",
    createdAt: 10,
    ...fields,
  };
}

test("subagent rows show running lanes first and sort each group by newest creation time", () => {
  const lanes = Object.freeze([
    lane("running-old"),
    lane("finished-old", { status: "done", createdAt: 30, endedAt: 60 }),
    lane("finished-new", { status: "failed", createdAt: 40, endedAt: 50 }),
    lane("running-new", { createdAt: 20 }),
  ]);

  assert.deepEqual(pomeloSubagentRows(lanes, "thread-a").map((row) => row.id), [
    "running-new", "running-old", "finished-new", "finished-old",
  ]);
});

test("subagent rows carry the spawner, status mark, tone and optional end time", () => {
  const lanes = [
    lane("active", { spawnedBy: "parent-lane" }),
    lane("complete", { status: "done", endedAt: 20 }),
    lane("error", { status: "failed", endedAt: 21 }),
    lane("stopped", { status: "cancelled" }),
  ];

  assert.deepEqual(pomeloSubagentRows(lanes, "thread-a"), [
    { id: "active", title: "Review the outline", by: "parent-lane", status: "working", tone: "neutral" },
    { id: "complete", title: "Review the outline", by: "main", status: "done", tone: "neutral", endedAt: 20 },
    { id: "error", title: "Review the outline", by: "main", status: "blocked", tone: "bad", endedAt: 21 },
    { id: "stopped", title: "Review the outline", by: "main", status: "open", tone: "neutral" },
  ]);
});

test("subagent titles fall back for empty purposes and fit on a short line", () => {
  const lanes = [
    lane("empty", { purpose: "" }),
    lane("blank", { purpose: " \n\t " }),
    lane("multiline", { purpose: "  Review\n the outline  " }),
    lane("long", { purpose: "a".repeat(120) + " more" }),
  ];

  assert.deepEqual(pomeloSubagentRows(lanes, "thread-a").map((row) => row.title), [
    "Sub-agent", "Sub-agent", "Review the outline", "a".repeat(120),
  ]);
});

test("subagent rows are scoped to the requested thread", () => {
  const lanes = [lane("here"), lane("elsewhere", { threadId: "thread-b" })];

  assert.deepEqual(pomeloSubagentRows(lanes, "thread-a").map((row) => row.id), ["here"]);
  assert.deepEqual(pomeloSubagentRows(lanes, "missing"), []);
});

test("the subagent tally counts each lane status and leaves zero counts out of its text", () => {
  const rows = pomeloSubagentRows([
    lane("first"), lane("second"), lane("complete", { status: "done" }),
    lane("error", { status: "failed" }), lane("stopped", { status: "cancelled" }),
  ], "thread-a");

  assert.deepEqual(pomeloSubagentTally(rows), {
    running: 2, done: 1, failed: 1, cancelled: 1, text: "2 working, 1 back, 1 failed, 1 stopped",
  });
  assert.equal(pomeloSubagentTally(rows.slice(0, 3)).text, "2 working, 1 back");
  assert.deepEqual(pomeloSubagentTally([]), { running: 0, done: 0, failed: 0, cancelled: 0, text: "" });
});
