import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localKV } from "../src/local/kv.js";
import { pomeloStore, type PomeloStore } from "../src/pomelo/store.js";
import { getTag, saveTag } from "../src/pomelo/tags.js";
import { addProjectTags, getThreadMeta, saveThreadMeta, type ThreadRecord } from "../src/pomelo/thread-meta.js";
import { retagThread } from "../src/pomelo/thread-retag.js";

async function rig(t: test.TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-thread-retag-"));
  const kv = await localKV(home, 60_000);
  t.after(async () => {
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  return { redis: kv.redis, store: pomeloStore(kv.redis) };
}

const thread: ThreadRecord = {
  sid: "thread-1",
  projectTags: ["pomelo", "tempo"],
  lastActivityAt: 200,
  openedBy: "agent:research",
  parentThreadId: "parent-1",
};

test("retagging replaces the tags and preserves thread and existing tag metadata", async (t) => {
  const { store } = await rig(t);
  const pomelo = { slug: "pomelo", label: "Pomelo", createdBy: "agent:research" };
  const tempo = { slug: "tempo", label: "Tempo", colour: "blue", createdBy: "agent:research" };
  await saveThreadMeta(store, thread);
  await saveTag(store, pomelo);
  await saveTag(store, tempo);

  const result = await retagThread(store, { sid: thread.sid, labels: ["TEMPO", "Kitchen"], by: "owner" });

  assert.deepEqual(result, { ok: true, tags: ["tempo", "kitchen"], added: ["kitchen"], removed: ["pomelo"] });
  assert.deepEqual(await getThreadMeta(store, thread.sid), { ...thread, projectTags: ["tempo", "kitchen"] });
  assert.deepEqual(await getTag(store, "kitchen"), { slug: "kitchen", label: "Kitchen", createdBy: "owner" });
  assert.deepEqual(await getTag(store, "tempo"), tempo);
  assert.deepEqual(await getTag(store, "pomelo"), pomelo);
});

test("normalizing labels keeps up to eight distinct slugs in first occurrence order", async (t) => {
  const { store } = await rig(t);
  const labels = ["!!!", "Build / Docs", "build-docs", "", "Tempo", "A", "B", "C", "D", "E", "F"];
  const tags = ["build-docs", "tempo", "a", "b", "c", "d", "e", "f"];

  const result = await retagThread(store, { sid: thread.sid, labels, by: "owner" });

  assert.deepEqual(result, { ok: true, tags, added: tags, removed: [] });
  assert.deepEqual(await getThreadMeta(store, thread.sid), {
    sid: thread.sid, projectTags: tags, lastActivityAt: 0, openedBy: "",
  });
  assert.deepEqual(await getTag(store, "build-docs"), { slug: "build-docs", label: "Build / Docs", createdBy: "owner" });
  assert.equal((await store.list("tag:")).length, 8);
});

test("nine distinct tags are refused before any write", async (t) => {
  const { store } = await rig(t);
  await saveThreadMeta(store, thread);
  const before = await store.list("");
  const write = t.mock.fn(store.set);
  const labels = Array.from({ length: 9 }, (_, index) => `Tag ${index + 1}`);

  const result = await retagThread({ ...store, set: write }, { sid: thread.sid, labels, by: "owner" });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /8/);
  assert.equal(write.mock.callCount(), 0);
  assert.deepEqual(await store.list(""), before);
});

test("an empty list clears the thread's tags", async (t) => {
  const { store } = await rig(t);
  await saveThreadMeta(store, thread);

  const result = await retagThread(store, { sid: thread.sid, labels: [], by: "owner" });

  assert.deepEqual(result, { ok: true, tags: [], added: [], removed: ["pomelo", "tempo"] });
  assert.deepEqual(await getThreadMeta(store, thread.sid), { ...thread, projectTags: [] });
});

test("a concurrent addition follows the retag and preserves both updates", async (t) => {
  const { redis, store } = await rig(t);
  await saveThreadMeta(store, thread);

  const [result] = await Promise.all([
    retagThread(store, { sid: thread.sid, labels: ["Kitchen"], by: "owner" }),
    addProjectTags(pomeloStore(redis), thread.sid, ["release"], 300),
  ]);

  assert.deepEqual(result, { ok: true, tags: ["kitchen"], added: ["kitchen"], removed: ["pomelo", "tempo"] });
  assert.deepEqual(await getThreadMeta(store, thread.sid), {
    ...thread, projectTags: ["kitchen", "release"], lastActivityAt: 300,
  });
});

test("the retag reports changes against the record written by an earlier queued addition", async (t) => {
  const { store } = await rig(t);
  await saveThreadMeta(store, thread);

  const [, result] = await Promise.all([
    addProjectTags(store, thread.sid, ["release"], 300),
    retagThread(store, { sid: thread.sid, labels: ["Tempo"], by: "owner" }),
  ]);

  assert.deepEqual(result, { ok: true, tags: ["tempo"], added: [], removed: ["pomelo", "release"] });
  assert.deepEqual(await getThreadMeta(store, thread.sid), { ...thread, projectTags: ["tempo"], lastActivityAt: 300 });
});

test("overlapping retags keep the first record for a shared slug", async (t) => {
  const { redis, store } = await rig(t);

  const results = await Promise.all([
    retagThread(store, { sid: "first", labels: ["Build Docs"], by: "first" }),
    retagThread(pomeloStore(redis), { sid: "second", labels: ["BUILD-DOCS"], by: "second" }),
  ]);

  const expected = { ok: true, tags: ["build-docs"], added: ["build-docs"], removed: [] };
  assert.deepEqual(results, [expected, expected]);
  assert.deepEqual(await getTag(store, "build-docs"), { slug: "build-docs", label: "Build Docs", createdBy: "first" });
});

test("a tag write failure leaves thread metadata intact and allows a retry", async (t) => {
  const { store } = await rig(t);
  await saveThreadMeta(store, thread);
  const write = t.mock.fn(store.set);
  write.mock.mockImplementationOnce(async () => { throw new Error("Tag write failed"); });
  const failingStore: PomeloStore = { ...store, set: write };
  const request = { sid: thread.sid, labels: ["Kitchen"], by: "owner" };

  const result = await retagThread(failingStore, request);

  assert.equal(result.ok, false);
  assert.deepEqual(await getThreadMeta(store, thread.sid), thread);
  assert.equal(await getTag(store, "kitchen"), null);

  assert.deepEqual(await retagThread(failingStore, request), {
    ok: true, tags: ["kitchen"], added: ["kitchen"], removed: ["pomelo", "tempo"],
  });
  assert.deepEqual(write.mock.calls.map((call) => call.arguments[0]), [
    "tag:kitchen", "tag:kitchen", "thread:thread-1",
  ]);
});
