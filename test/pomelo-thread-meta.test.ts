import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localKV } from "../src/local/kv.js";
import { pomeloStore } from "../src/pomelo/store.js";
import {
  addProjectTags, getThreadMeta, saveThreadMeta, threadKey, threadMetaMap, touchThread,
  type ThreadRecord,
} from "../src/pomelo/thread-meta.js";

async function rig(t: test.TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-thread-meta-"));
  const kv = await localKV(home, 60_000);
  t.after(async () => {
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  return { redis: kv.redis, store: pomeloStore(kv.redis) };
}

const thread: ThreadRecord = {
  sid: "thread-1",
  projectTags: ["docs", "planning"],
  lastActivityAt: 200,
  openedBy: "agent:research",
  parentThreadId: "parent-1",
};

test("thread metadata round-trips under the Pomelo thread key", async (t) => {
  const { redis, store } = await rig(t);

  assert.equal(threadKey(thread.sid), "thread:thread-1");
  await saveThreadMeta(store, thread);

  assert.deepEqual(await getThreadMeta(store, thread.sid), thread);
  assert.deepEqual(JSON.parse((await redis.get("pomelo:thread:thread-1"))!), thread);
  assert.equal(await getThreadMeta(store, "missing"), null);
});

test("adding project tags keeps their first occurrence and creates missing metadata", async (t) => {
  const { store } = await rig(t);
  await saveThreadMeta(store, { ...thread, projectTags: ["docs", "planning", "docs"] });

  await addProjectTags(store, thread.sid, ["release", "docs", "build", "release"], 100);
  assert.deepEqual(await getThreadMeta(store, thread.sid), {
    ...thread,
    projectTags: ["docs", "planning", "release", "build"],
  });

  await addProjectTags(store, "new-thread", ["build", "docs", "build"], 300);
  assert.deepEqual(await getThreadMeta(store, "new-thread"), {
    sid: "new-thread",
    projectTags: ["build", "docs"],
    lastActivityAt: 300,
    openedBy: "",
  });
});

test("touching a thread advances its activity and preserves the other fields", async (t) => {
  const { store } = await rig(t);
  await saveThreadMeta(store, thread);

  await touchThread(store, thread.sid, 300);
  await touchThread(store, thread.sid, 100);
  assert.deepEqual(await getThreadMeta(store, thread.sid), { ...thread, lastActivityAt: 300 });

  await touchThread(store, "new-thread", 400);
  assert.deepEqual(await getThreadMeta(store, "new-thread"), {
    sid: "new-thread",
    projectTags: [],
    lastActivityAt: 400,
    openedBy: "",
  });
});

test("overlapping updates keep all tags and the latest activity", async (t) => {
  const { redis, store } = await rig(t);
  await saveThreadMeta(store, thread);

  await Promise.all([
    addProjectTags(store, thread.sid, ["release"], 300),
    touchThread(pomeloStore(redis), thread.sid, 500),
    addProjectTags(store, thread.sid, ["build"], 400),
  ]);

  assert.deepEqual(await getThreadMeta(store, thread.sid), {
    ...thread,
    projectTags: ["docs", "planning", "release", "build"],
    lastActivityAt: 500,
  });
});

test("the metadata map keys records by session id and skips invalid records", async (t) => {
  const { store } = await rig(t);
  const another = { ...thread, sid: "__proto__" };
  await saveThreadMeta(store, thread);
  await saveThreadMeta(store, another);
  await store.set("tag:docs", thread);
  await store.set("thread:wrong-id", thread);
  await store.set("thread:bad", { ...thread, sid: "bad", projectTags: [1] });

  assert.deepEqual(await threadMetaMap(store), { [thread.sid]: thread, [another.sid]: another });
});

test("empty session ids and ids containing a colon are refused", async (t) => {
  const { store } = await rig(t);

  for (const sid of ["", "thread:child"]) {
    assert.throws(() => threadKey(sid));
    await assert.rejects(saveThreadMeta(store, { ...thread, sid }));
    await assert.rejects(getThreadMeta(store, sid));
    await assert.rejects(addProjectTags(store, sid, ["docs"], 100));
    await assert.rejects(touchThread(store, sid, 100));
  }
  assert.deepEqual(await store.list("thread:"), []);
});

test("malformed JSON and wrong field types read as missing metadata", async (t) => {
  const { redis, store } = await rig(t);
  await redis.set("pomelo:thread:thread-1", "{");
  assert.equal(await getThreadMeta(store, thread.sid), null);
  assert.deepEqual(await threadMetaMap(store), {});

  for (const wrongFields of [
    { sid: 1 },
    { projectTags: "docs" },
    { projectTags: [1] },
    { lastActivityAt: "200" },
    { openedBy: false },
    { parentThreadId: null },
  ]) {
    await store.set(threadKey(thread.sid), { ...thread, ...wrongFields });
    assert.equal(await getThreadMeta(store, thread.sid), null);
  }
});
