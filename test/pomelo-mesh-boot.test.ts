import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AgentMesh } from "../src/agent-mesh.js";
import { Bus } from "../src/bus.js";
import { localKV } from "../src/local/kv.js";
import { listLanes } from "../src/pomelo/lanes.js";
import { fridayMeshDeps, pomeloMeshHook } from "../src/pomelo/mesh-boot.js";
import type { PomeloMeshDeps } from "../src/pomelo/mesh-handlers.js";
import { pomeloStore } from "../src/pomelo/store.js";
import { getThreadMeta } from "../src/pomelo/thread-meta.js";
import { SessionCore } from "../src/session/core.js";
import { SessionStore } from "../src/session/store.js";
import { MAIN_LANE } from "../src/types.js";

const sid = "parent";
const lane = "caller";
const now = 1_700_000_000_000;

function setup(t: test.TestContext) {
  const records = new Map<string, unknown>();
  const threadTags = new Map([[sid, ["existing"]]]);
  const deps = {
    createThread: t.mock.fn<PomeloMeshDeps["createThread"]>(async ({ title }) => ({ id: "child", title })),
    addLane: t.mock.fn<PomeloMeshDeps["addLane"]>(async () => ({ name: "Review" })),
    async addProjectTags(threadId, slugs) {
      threadTags.set(threadId, [...new Set([...(threadTags.get(threadId) ?? []), ...slugs])]);
    },
    store: {
      async get<T>(key: string) { return (records.get(key) ?? null) as T | null; },
      async set(key, value) { records.set(key, value); return true; },
      async list() { assert.fail("unexpected list"); },
      async appendLog() { assert.fail("unexpected appendLog"); },
    },
    now: () => now,
  } satisfies PomeloMeshDeps;
  return { hook: pomeloMeshHook(deps), deps, records, threadTags };
}

test("the startup hook offers exactly the three Pomelo tools", (t) => {
  const { hook } = setup(t);
  assert.deepEqual(hook.tools.map(({ name }) => name), ["open_thread", "spawn_subagent", "tag_project"]);
});

test("tag_project saves a tag record and adds its slug to the calling thread", async (t) => {
  const { hook, records, threadTags } = setup(t);
  assert.deepEqual(await hook.call(sid, lane, "tag_project", { tags: ["Release Notes"] }), {
    output: "Tagged this thread: release-notes.",
  });
  assert.deepEqual(records.get("tag:release-notes"), { slug: "release-notes", label: "Release Notes", createdBy: lane });
  assert.deepEqual(threadTags.get(sid), ["existing", "release-notes"]);
});

test("open_thread forwards the calling lane and session to createThread", async (t) => {
  const { hook, deps } = setup(t);
  assert.deepEqual(await hook.call(sid, lane, "open_thread", { title: "Docs", prompt: "Check the examples." }), {
    output: 'Opened thread "Docs" (child).',
  });
  assert.deepEqual(deps.createThread.mock.calls.map(({ arguments: args }) => args), [[{
    title: "Docs", prompt: "Check the examples.", projectTags: [],
    openedBy: lane, parentThreadId: sid, lastActivityAt: now,
  }]]);
});

test("spawn_subagent forwards the calling lane to addLane", async (t) => {
  const { hook, deps } = setup(t);
  assert.deepEqual(await hook.call(sid, lane, "spawn_subagent", { purpose: "Review", prompt: "Check the examples.", tool: "codex" }), {
    output: 'Spawned subagent "Review".',
  });
  assert.deepEqual(deps.addLane.mock.calls.map(({ arguments: args }) => args), [[sid, {
    purpose: "Review", prompt: "Check the examples.", tool: "codex", spawnedBy: lane, status: "waiting",
  }]]);
});

test("unknown tool names fall through to Friday", async (t) => {
  const { hook } = setup(t);
  assert.equal(await hook.call(sid, lane, "list_agents", {}), null);
});

test("the startup hook returns a tool error when a dependency throws", async (t) => {
  const { hook, deps } = setup(t);
  deps.createThread.mock.mockImplementationOnce(async () => { throw new Error("create failed"); });
  assert.deepEqual(await hook.call(sid, lane, "open_thread", { title: "Docs", prompt: "Check the examples." }), {
    output: "Could not complete open_thread.", isError: true,
  });
});

test("the mesh with the app adapter creates a listed thread and a lane with queued instructions", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-mesh-boot-"));
  const kv = await localKV(home, 60_000);
  t.after(async () => {
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  const sessions = new SessionStore(kv.redis, "mesh-boot:");
  const store = pomeloStore(kv.redis);
  const core = new SessionCore(sessions, () => {}, undefined, undefined, undefined, null, "", async () => 0);
  const mesh = new AgentMesh(sessions, new Bus(kv.redis, kv.sub, sessions.prefix));
  mesh.pomelo = pomeloMeshHook(fridayMeshDeps({ sessions, store, handle: core.handle.bind(core) }));
  const owner = { id: "owner", name: "Owner", role: "owner" } as const;
  await sessions.create(sid, "Parent", owner, { mcp: true }, "workspace");
  assert.equal((await core.handle(sid, owner, { type: "engine.expect", tool: "codex" })).ok, true);

  assert.deepEqual((await mesh.listingFor(sid, false)).tools.slice(-3).map(({ name }) => name), [
    "open_thread", "spawn_subagent", "tag_project",
  ]);
  assert.deepEqual(await mesh.call(sid, MAIN_LANE, "tag_project", { tags: ["Release Notes"] }), {
    output: "Tagged this thread: release-notes.",
  });
  const opened = await mesh.call(sid, MAIN_LANE, "open_thread", { title: "Docs", prompt: "Draft the notes." });
  assert.match(opened.output, /^Opened thread "Docs"/);
  const child = (await sessions.mine(owner.id)).find((row) => row.sid !== sid);
  assert.ok(child);
  const meta = await getThreadMeta(store, child.sid);
  assert.equal(meta?.parentThreadId, sid);
  assert.equal(meta?.openedBy, MAIN_LANE);
  assert.deepEqual(meta?.projectTags, ["release-notes"]);
  assert.ok((await sessions.events(child.sid)).some(({ body }) => body.type === "instruction" && body.text === "Draft the notes."));

  assert.deepEqual(await mesh.call(sid, MAIN_LANE, "spawn_subagent", { purpose: "Review", prompt: "Check the examples." }), {
    output: 'Spawned subagent "Review".',
  });
  const state = await sessions.state(sid);
  const added = state.lanes.find(({ name }) => name === "Review");
  assert.ok(added);
  assert.equal(state.engines[added.id]?.tool, "codex");
  const [record] = await listLanes(store, sid);
  assert.equal(record?.laneId, added.id);
  assert.equal(record?.spawnedBy, MAIN_LANE);
  assert.ok((await sessions.events(sid)).some(({ lane, body }) =>
    lane === added.id && body.type === "instruction" && body.text === "Check the examples."));
});

test("app startup assigns the mesh's Pomelo hook exactly once", async () => {
  const source = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  const assignments = source.match(/^[\t ]*mesh\.pomelo\s*=(?!=).*$/gm) ?? [];
  assert.equal(assignments.length, 1);
  assert.match(assignments[0], /mesh\.pomelo\s*=\s*pomeloMeshHook\(/);
});
