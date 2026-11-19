import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { localKV } from "../src/local/kv.js";
import { NO_MODELS } from "../src/local/no-models.js";
import { sessionRowsWithMeta, withThreadMeta } from "../src/pomelo/session-rows.js";
import { pomeloStore, type PomeloStore } from "../src/pomelo/store.js";
import { saveThreadMeta, type ThreadRecord } from "../src/pomelo/thread-meta.js";

const thread: ThreadRecord = {
  sid: "thread-1",
  projectTags: ["docs", "planning"],
  lastActivityAt: 200,
  openedBy: "agent:research",
  parentThreadId: "parent-1",
};

test("sessions without a thread record use Friday's timestamp and empty tags", () => {
  const rows = [{ sid: "legacy", at: 300 }, { sid: "constructor", at: 400 }];

  assert.deepEqual(withThreadMeta(rows, {}), [
    { sid: "legacy", at: 300, projectTags: [], lastActivityAt: 300 },
    { sid: "constructor", at: 400, projectTags: [], lastActivityAt: 400 },
  ]);
});

test("thread metadata preserves row order and fields, even when activity is older than at", () => {
  const row = { sid: thread.sid, at: 500, title: "Plan", role: "owner", work: true };
  const rows = [row, { sid: "legacy", at: 800, title: "Draft", role: "owner", work: false }];
  const projectTags = [...thread.projectTags];
  const record = { ...thread, projectTags };

  const result = withThreadMeta(rows, { [thread.sid]: record });

  assert.deepEqual(result, [
    {
      ...row,
      projectTags: ["docs", "planning"],
      lastActivityAt: 200,
      openedBy: "agent:research",
      parentThreadId: "parent-1",
    },
    { ...rows[1], projectTags: [], lastActivityAt: 800 },
  ]);
  assert.notEqual(result[0], row);
  assert.notEqual(result[0].projectTags, projectTags);
  assert.deepEqual(record, thread);
  assert.deepEqual(rows, [
    { sid: thread.sid, at: 500, title: "Plan", role: "owner", work: true },
    { sid: "legacy", at: 800, title: "Draft", role: "owner", work: false },
  ]);
});

test("non-finite activity falls back to at and empty opener and parent are omitted", () => {
  const row = { sid: thread.sid, at: 500 };
  for (const lastActivityAt of [NaN, Infinity, -Infinity]) {
    const record = { ...thread, lastActivityAt, openedBy: "", parentThreadId: "" };
    assert.deepEqual(withThreadMeta([row], { [row.sid]: record }), [
      { ...row, projectTags: ["docs", "planning"], lastActivityAt: 500 },
    ]);
  }
});

test("a failed thread metadata read returns the original rows", async () => {
  const rows = [{ sid: thread.sid, at: 300 }];
  let listedPrefix: string | undefined;
  const store: PomeloStore = {
    async get() { assert.fail("unexpected get"); },
    async set() { assert.fail("unexpected set"); },
    async list(prefix) {
      listedPrefix = prefix;
      throw new Error("thread records unavailable");
    },
    async appendLog() { assert.fail("unexpected appendLog"); },
  };

  assert.equal(await sessionRowsWithMeta(store, rows), rows);
  assert.equal(listedPrefix, "thread:");
  assert.deepEqual(rows, [{ sid: thread.sid, at: 300 }]);
});

test("GET /api/sessions/mine includes stored thread metadata alongside Friday's fields", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-session-rows-"));
  const kv = await localKV(home);
  const app = await createApp({
    port: 0,
    redisUrl: "",
    prefix: "friday:",
    secret: "s",
    driverGraceMs: 15_000,
    llm: NO_MODELS,
    dataDir: path.join(home, "uploads"),
    local: { redis: kv.redis, sub: kv.sub, user: { id: "local", name: "Me" } },
    teammatesHome: home,
  });
  t.after(async () => {
    await app.close();
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  const headers = { "Content-Type": "application/json", "x-friday-local": "1" };
  const title = "Plan the release";
  const created = await fetch(`${app.url}/api/sessions`, {
    method: "POST", headers, body: JSON.stringify({ title }),
  });
  assert.equal(created.status, 201);
  const { sessionId: sid, invites } = await created.json() as { sessionId: string; invites: { owner: string } };
  const listed = (await app.store.mine("local")).find((row) => row.sid === sid);
  assert.ok(listed);
  const fridayRow = { sid, title, role: "owner", invite: invites.owner, at: listed.at };
  const getRows = async () => {
    const response = await fetch(`${app.url}/api/sessions/mine`, { headers });
    assert.equal(response.status, 200);
    return (await response.json() as { sessions: { sid: string }[] }).sessions;
  };

  assert.deepEqual((await getRows()).find((row) => row.sid === sid), {
    ...fridayRow, projectTags: [], lastActivityAt: listed.at,
  });

  const lastActivityAt = listed.at + 1_000;
  await saveThreadMeta(pomeloStore(kv.redis), { ...thread, sid, lastActivityAt });

  assert.deepEqual((await getRows()).find((row) => row.sid === sid), {
    ...fridayRow,
    projectTags: thread.projectTags,
    lastActivityAt,
    openedBy: thread.openedBy,
    parentThreadId: thread.parentThreadId,
  });
});
