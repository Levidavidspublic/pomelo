import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localKV } from "../src/local/kv.js";
import { createLane, setLaneStatus } from "../src/pomelo/lanes.js";
import { pomeloStore } from "../src/pomelo/store.js";
import { getTag } from "../src/pomelo/tags.js";
import { runThreadAction, type ThreadActionRequest } from "../src/pomelo/thread-actions.js";
import { getThreadMeta, saveThreadMeta } from "../src/pomelo/thread-meta.js";

const sid = "thread-1";
const thread = { sid, projectTags: ["original"], lastActivityAt: 10, openedBy: "agent-1" };

async function rig(t: test.TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-thread-actions-"));
  const kv = await localKV(home, 60_000);
  t.after(async () => {
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  return { store: pomeloStore(kv.redis), redis: kv.redis };
}

test("retag replaces the tags, preserves the rest of the record, and can be retried", async (t) => {
  const { store } = await rig(t);
  const record = { ...thread, title: "Draft", titleBy: "agent", archivedAt: 15 };
  await saveThreadMeta(store, record);
  const request = { action: "retag", sid, labels: ["Release Notes", "Kitchen"], by: "amit" } satisfies ThreadActionRequest;
  const projectTags = ["release-notes", "kitchen"];
  const reply = { ok: true, action: "retag", thread: { sid, projectTags } };

  assert.deepEqual(await runThreadAction(store, request, 20), reply);
  assert.deepEqual(await getThreadMeta(store, sid), { ...record, projectTags });
  const saved = await store.list("");
  assert.deepEqual(await runThreadAction(store, request, 30), reply);
  assert.deepEqual(await store.list(""), saved);
  assert.deepEqual(await getTag(store, "release-notes"), {
    slug: "release-notes", label: "Release Notes", createdBy: "amit",
  });
});

test("rename saves the cleaned title and protects Amit's title from an agent", async (t) => {
  const { store } = await rig(t);
  const record = { ...thread, title: "Draft", titleBy: "agent", archivedAt: 15 };
  await saveThreadMeta(store, record);

  assert.deepEqual(await runThreadAction(store, { action: "rename", sid, title: "  **Release\tplan**  ", by: "amit" }, 20), {
    ok: true, action: "rename", thread: { sid, title: "Release plan", titleBy: "amit" },
  });
  assert.deepEqual(await runThreadAction(store, { action: "rename", sid, title: "Agent draft", by: "agent" }, 30), {
    ok: false, code: "rename_refused", reason: "Amit named this thread.",
  });
  assert.deepEqual(await getThreadMeta(store, sid), { ...record, title: "Release plan", titleBy: "amit" });
});

test("a running lane blocks put away, and bring back clears the saved archive time", async (t) => {
  const { store } = await rig(t);
  const record = { ...thread, title: "Draft", titleBy: "agent" };
  await saveThreadMeta(store, record);
  const laneId = "lane-1";
  await createLane(store, { threadId: sid, laneId, spawnedBy: "agent-1", purpose: "Review", createdAt: 15 });
  const archive = { action: "archive", sid } satisfies ThreadActionRequest;
  const before = await store.list("");
  const write = t.mock.fn(store.set);

  assert.deepEqual(await runThreadAction({ ...store, set: write }, archive, 20), {
    ok: false, code: "lanes_running", reason: "Wait for the running sub-agents to finish before putting away this thread.",
  });
  assert.equal(write.mock.callCount(), 0);
  assert.deepEqual(await store.list(""), before);
  await setLaneStatus(store, sid, laneId, "done", 25);

  const archived = { ok: true, action: "archive", thread: { sid, archivedAt: 30 } };
  assert.deepEqual(await runThreadAction(store, archive, 30), archived);
  assert.deepEqual(await runThreadAction(store, archive, 40), archived);
  assert.deepEqual(await getThreadMeta(store, sid), { ...record, archivedAt: 30 });

  const restored = await runThreadAction(store, { action: "unarchive", sid }, 50);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), {
    ok: true, action: "unarchive", thread: { sid, archivedAt: null },
  });
  assert.deepEqual(await getThreadMeta(store, sid), record);
});

test("invalid requests and missing threads each get a fixed refusal without writes", async (t) => {
  const { store } = await rig(t);
  await saveThreadMeta(store, thread);
  const before = await store.list("");
  const write = t.mock.fn(store.set);
  const observedStore = { ...store, set: write };
  const cases = [
    { request: { action: "stop-subagents", sid }, code: "unknown_action", reason: "Choose a supported thread action." },
    { request: { action: "archive" }, code: "missing_sid", reason: "Provide a thread ID." },
    { request: { action: "archive", sid: "thread:1" }, code: "invalid_sid", reason: "Provide a valid thread ID." },
    {
      request: { action: "retag", sid: "missing-thread", labels: ["New project"], by: "amit" },
      code: "thread_not_found", reason: "Thread not found.",
    },
    ...[null, [], "archive"].map((request) => ({
      request, code: "invalid_body", reason: "Provide a thread action object.",
    })),
    {
      request: { action: "retag", sid, labels: ["Release", 42], by: "amit" },
      code: "invalid_retag", reason: "Provide tag labels as text and say who is retagging the thread.",
    },
    {
      request: { action: "rename", sid, title: "Draft", by: "unknown" },
      code: "invalid_rename", reason: "Provide a title and say whether Amit or an agent is renaming the thread.",
    },
  ];

  for (const { request, code, reason } of cases) {
    assert.deepEqual(await runThreadAction(observedStore, request, 20), { ok: false, code, reason });
  }
  assert.equal(write.mock.callCount(), 0);
  assert.deepEqual(await store.list(""), before);
});

test("rename masks a synthetic canary before returning or storing the title and preserves Hebrew", async (t) => {
  const { store, redis } = await rig(t);
  await saveThreadMeta(store, thread);
  const canary = "fixture-canary-" + "x".repeat(25);
  const title = "תִּכְנוּן הפרויקט";
  const maskedTitle = `${title} [hidden]`;

  const masked = await runThreadAction(store, { action: "rename", sid, title: `${title} Bearer ${canary}`, by: "amit" }, 20);
  assert.deepEqual(masked, { ok: true, action: "rename", thread: { sid, title: maskedTitle, titleBy: "amit" } });
  assert.equal(JSON.stringify(masked).includes(canary), false);
  assert.deepEqual(await getThreadMeta(store, sid), { ...thread, title: maskedTitle, titleBy: "amit" });
  const [raw] = await redis.mget(`pomelo:thread:${sid}`);
  assert.equal(typeof raw === "string" && raw.includes(canary), false);

  assert.deepEqual(await runThreadAction(store, { action: "rename", sid, title, by: "amit" }, 30), {
    ok: true, action: "rename", thread: { sid, title, titleBy: "amit" },
  });
  assert.deepEqual(await getThreadMeta(store, sid), { ...thread, title, titleBy: "amit" });
});

test("overlapping actions on the same thread preserve each update", async (t) => {
  const { store, redis } = await rig(t);
  await saveThreadMeta(store, thread);

  const replies = await Promise.all([
    runThreadAction(store, { action: "rename", sid, title: "Release plan", by: "amit" }, 20),
    runThreadAction(pomeloStore(redis), { action: "archive", sid }, 25),
    runThreadAction(store, { action: "retag", sid, labels: ["Release"], by: "amit" }, 30),
  ]);

  assert.ok(replies.every(({ ok }) => ok));
  assert.deepEqual(await getThreadMeta(store, sid), {
    ...thread, projectTags: ["release"], title: "Release plan", titleBy: "amit", archivedAt: 25,
  });
});

test("a store error gives a plain refusal and the same action can be retried", async (t) => {
  const { store } = await rig(t);
  await saveThreadMeta(store, thread);
  const request = { action: "archive", sid } satisfies ThreadActionRequest;
  const write = t.mock.fn(store.set);
  write.mock.mockImplementationOnce(async () => { throw new Error("Internal store failure"); });

  assert.deepEqual(await runThreadAction({ ...store, set: write }, request, 20), {
    ok: false, code: "store_error", reason: "Could not update the thread.",
  });
  assert.deepEqual(await getThreadMeta(store, sid), thread);
  assert.deepEqual(await runThreadAction(store, request, 20), {
    ok: true, action: "archive", thread: { sid, archivedAt: 20 },
  });
});
