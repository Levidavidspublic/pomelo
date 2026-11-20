import assert from "node:assert/strict";
import { test } from "node:test";
import { laneListReply, loadLaneList } from "../src/pomelo/lane-list-reply.js";
import { createLane, type SubagentLane } from "../src/pomelo/lanes.js";
import type { PomeloStore } from "../src/pomelo/store.js";
import { HIDDEN } from "../src/secrets.js";

const minute = 60_000;
const now = 30 * minute;
const threadId = "thread";
const spawnedBy = "parent";
const purpose = "Draft a summary";

function lane(laneId: string, createdAt: number, status: SubagentLane["status"] = "running"): SubagentLane {
  return { threadId, laneId, createdAt, status, spawnedBy, purpose };
}

test("the reply projects only lane row fields in oldest-first order", () => {
  const newest = { ...lane("newest", now - 1), prompt: "Draft an outline", args: { sample: true }, step: "Outline ready" };
  const lanes = [newest, lane("oldest", now - 3), lane("middle", now - 2)];

  assert.deepEqual(laneListReply(lanes, now), {
    lanes: ["oldest", "middle", "newest"].map((laneId, index) => ({
      laneId, purpose, spawnedBy, status: "running", state: "running", createdAt: now - 3 + index,
    })),
    counts: { running: 3, waiting: 0, stuck: 0 },
    more: 0,
  });
  assert.deepEqual(lanes.map(({ laneId }) => laneId), ["newest", "oldest", "middle"]);
});

test("the stall rule determines the shown state and the badge count", () => {
  const lanes = [
    lane("waiting", now - 20 * minute),
    lane("stuck", now - 19 * minute),
    lane("fresh", now - 18 * minute),
  ];
  const reply = laneListReply(lanes, now, {
    timingByLane: new Map([
      ["waiting", { askOpen: true }],
      ["fresh", { lastStepAt: now - minute }],
    ]),
  });

  assert.deepEqual(reply.lanes.map(({ status, state }) => [status, state]), [
    ["running", "waiting"], ["running", "stuck"], ["running", "running"],
  ]);
  assert.deepEqual(reply.counts, { running: 1, waiting: 1, stuck: 1 });
});

test("finished lanes keep their status and end time and contribute no badge count", () => {
  const statuses = ["done", "failed", "cancelled"] as const;
  const lanes = statuses.map((status, index) => ({
    ...lane(status, index, status), endedAt: now - 3 + index,
  }));
  const reply = laneListReply(lanes, now);

  assert.deepEqual(reply.lanes.map(({ status, state, endedAt }) => [status, state, endedAt]),
    statuses.map((status, index) => [status, status, now - 3 + index]));
  assert.deepEqual(reply.counts, { running: 0, waiting: 0, stuck: 0 });
});

test("the reply hides secret-shaped values in the purpose before clipping", () => {
  const sample = "illustrative-123";
  const prefix = "א".repeat(106) + " password=";
  const reply = laneListReply([
    { ...lane("fixture", now), purpose: `Sample password=${sample}` },
    { ...lane("boundary", now), purpose: prefix + sample },
  ], now);

  assert.equal(reply.lanes[0].purpose, `Sample password=${HIDDEN}`);
  assert.equal(reply.lanes[1].purpose, (prefix + HIDDEN).slice(0, 120));
});

test("the purpose cap keeps Hebrew combining marks and emoji sequences whole", () => {
  const prefix = "שָׁ".repeat(119);
  const emoji = "👩🏽‍💻";
  const reply = laneListReply([{ ...lane("unicode", now), purpose: prefix + emoji + "עוד" }], now);

  assert.equal(reply.lanes[0].purpose, prefix + emoji);
});

test("the default cap keeps active lanes and the newest finished lanes", () => {
  const finished = Array.from({ length: 57 }, (_, i) => lane(`finished-${i}`, now - 60 + i, "done"));
  const active = [
    lane("stuck", now - 20 * minute),
    lane("waiting", now - 59),
    lane("running", now),
  ];
  const lanes = [...finished, ...active].reverse();
  const options = { timingByLane: new Map([["waiting", { askOpen: true }]]) };
  const reply = laneListReply(lanes, now, options);

  assert.deepEqual(reply.lanes.map(({ laneId }) => laneId),
    ["stuck", "waiting", ...finished.slice(10).map(({ laneId }) => laneId), "running"]);
  assert.equal(reply.lanes.length, 50);
  assert.equal(reply.more, 10);
  assert.deepEqual(reply.counts, { running: 1, waiting: 1, stuck: 1 });
});

test("a smaller cap still counts active lanes across the entire thread", () => {
  const reply = laneListReply([lane("later", now), lane("earlier", now - 1)], now, { limit: 1 });

  assert.deepEqual(reply.lanes.map(({ laneId }) => laneId), ["earlier"]);
  assert.equal(reply.more, 1);
  assert.deepEqual(reply.counts, { running: 2, waiting: 0, stuck: 0 });
});

test("malformed records do not contribute rows, counts or overflow", () => {
  const valid = lane("valid", now);
  const { laneId, ...missingId } = valid;
  const reply = laneListReply([
    null, missingId, { ...valid, purpose: 42 }, { ...valid, status: "unknown" },
    { ...valid, createdAt: NaN }, { ...valid, endedAt: "later" }, valid,
  ], now);

  assert.deepEqual(reply.lanes.map((row) => row.laneId), [laneId]);
  assert.deepEqual(reply.counts, { running: 1, waiting: 0, stuck: 0 });
  assert.equal(reply.more, 0);
});

test("an empty thread has no rows and zero counts", () => {
  assert.deepEqual(laneListReply([], now), {
    lanes: [], counts: { running: 0, waiting: 0, stuck: 0 }, more: 0,
  });
});

test("loadLaneList projects the records created for the requested thread", async () => {
  const records = new Map<string, unknown>();
  const store: PomeloStore = {
    async get<T>(key: string) {
      return (records.get(key) as T | undefined) ?? null;
    },
    async set(key, value, condition) {
      if (condition === "ifMissing" && records.has(key)) return false;
      records.set(key, value);
      return true;
    },
    async list<T>(prefix: string) {
      return [...records.keys()].filter((key) => key.startsWith(prefix)).sort()
        .map((key) => ({ key, value: records.get(key) as T }));
    },
    async appendLog() {},
  };
  const lanes = [lane("a-new", now), lane("z-old", now - 11 * minute)];
  for (const input of lanes) await createLane(store, input);
  await createLane(store, { ...lane("other", now), threadId: "thread-other" });

  assert.deepEqual(await loadLaneList(store, threadId, now), laneListReply(lanes, now));
  assert.deepEqual(await loadLaneList(store, "missing", now), laneListReply([], now));
});
