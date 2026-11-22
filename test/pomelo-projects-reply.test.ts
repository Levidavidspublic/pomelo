import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localKV } from "../src/local/kv.js";
import { projectsReply } from "../src/pomelo/projects-reply.js";
import { pomeloStore } from "../src/pomelo/store.js";
import { saveTag } from "../src/pomelo/tags.js";
import type { ThreadArchiveRecord } from "../src/pomelo/thread-archive.js";
import { saveThreadMeta } from "../src/pomelo/thread-meta.js";

async function makeStore(t: test.TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-projects-reply-"));
  const kv = await localKV(home, 60_000);
  t.after(async () => {
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  return pomeloStore(kv.redis);
}

test("lists three projects by latest thread activity then name, including put-away projects", async (t) => {
  const store = await makeStore(t);
  const hebrew = "תִּכְנוּן שבועי";
  await saveTag(store, { slug: "current", label: "Alpha", colour: "#8FA3BF", createdBy: "owner" });
  await saveTag(store, { slug: "weekly", label: hebrew, createdBy: "owner" });
  const archived = { slug: "archive", label: "Zulu", colour: "#123456\n", createdBy: "owner", archivedAt: 600 };
  await saveTag(store, archived);

  const threads: ThreadArchiveRecord[] = [
    { sid: "shared", projectTags: ["current", "archive", "current"], lastActivityAt: 300, openedBy: "owner" },
    { sid: "weekly", projectTags: ["weekly"], lastActivityAt: 400, openedBy: "owner" },
    { sid: "put-away", projectTags: ["current", "archive"], lastActivityAt: 500, openedBy: "owner", archivedAt: 500 },
    { sid: "current", projectTags: ["current"], lastActivityAt: 150, openedBy: "owner" },
    { sid: "archive", projectTags: ["archive"], lastActivityAt: 100, openedBy: "owner" },
  ];
  for (const thread of threads) await saveThreadMeta(store, thread);

  assert.deepEqual(await projectsReply(store), {
    projects: [
      {
        slug: "current", name: "Alpha", colour: "#8FA3BF", threadCount: 2, putAwayCount: 1,
        putAway: false, lastActivityAt: 500,
      },
      {
        slug: "archive", name: "Zulu", colour: null, threadCount: 2, putAwayCount: 1,
        putAway: true, lastActivityAt: 500,
      },
      {
        slug: "weekly", name: hebrew, colour: null, threadCount: 1, putAwayCount: 0,
        putAway: false, lastActivityAt: 400,
      },
    ],
  });
});

test("includes thread-only tags and masks names at reply time", async (t) => {
  const store = await makeStore(t);
  const canary = "sample9canary";
  const label = `Bearer ${canary}`;
  await saveTag(store, { slug: "masked", label, createdBy: "owner" });
  // This synthetic value is short enough to reach the reply through the store's write shield.
  assert.equal((await store.get<{ label: string }>("tag:masked"))?.label, label);
  await saveThreadMeta(store, {
    sid: "leftover", projectTags: ["leftover"], lastActivityAt: 200, openedBy: "owner",
  });

  const reply = await projectsReply(store);
  assert.equal(JSON.stringify(reply).includes(canary), false);
  assert.deepEqual(reply, {
    projects: [
      {
        slug: "leftover", name: "leftover", colour: null, threadCount: 1, putAwayCount: 0,
        putAway: false, lastActivityAt: 200,
      },
      {
        slug: "masked", name: "[hidden]", colour: null, threadCount: 0, putAwayCount: 0,
        putAway: false, lastActivityAt: 0,
      },
    ],
  });
});

test("a credential-shaped thread tag is masked in both the slug and the fallback name", async (t) => {
  const store = await makeStore(t);
  const canary = ["sk", "example9canary"].join("-");
  await saveThreadMeta(store, {
    sid: "leftover", projectTags: [canary], lastActivityAt: 200, openedBy: "owner",
  });

  const reply = await projectsReply(store);
  assert.equal(JSON.stringify(reply).includes(canary), false);
  assert.equal(reply.projects[0]?.slug, "[hidden]");
  assert.equal(reply.projects[0]?.name, "[hidden]");
});

test("an empty store has no projects", async (t) => {
  assert.deepEqual(await projectsReply(await makeStore(t)), { projects: [] });
});
