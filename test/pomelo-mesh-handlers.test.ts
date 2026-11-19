import assert from "node:assert/strict";
import test from "node:test";
import { AgentMesh, meshListing } from "../src/agent-mesh.js";
import { pomeloMeshCall, type PomeloMeshDeps } from "../src/pomelo/mesh-handlers.js";
import { openThreadAsk, POMELO_MESH_TOOLS, spawnSubagentAsk, tagProjectAsk } from "../src/pomelo/mesh-tools.js";
import { project } from "../src/session/projection.js";
import { MAIN_LANE } from "../src/types.js";

const sid = "parent";
const lane = "caller";
const now = 1_700_000_000_000;

function rig(t: test.TestContext) {
  const records = new Map<string, unknown>();
  const projectTags = new Map([[sid, ["existing"]]]);
  const deps = {
    createThread: t.mock.fn<PomeloMeshDeps["createThread"]>(async (request) => ({ id: "child", title: request.title })),
    addLane: t.mock.fn<PomeloMeshDeps["addLane"]>(async () => ({ name: "Reviewer" })),
    addProjectTags: t.mock.fn<PomeloMeshDeps["addProjectTags"]>(async (threadId, slugs) => {
      projectTags.set(threadId, [...new Set([...(projectTags.get(threadId) ?? []), ...slugs])]);
    }),
    store: {
      async get<T>(key: string) { return (records.get(key) ?? null) as T | null; },
      set: t.mock.fn<PomeloMeshDeps["store"]["set"]>(async (key, value, condition) => {
        if (condition === "ifMissing" && records.has(key)) return false;
        records.set(key, value);
        return true;
      }),
      async list() { assert.fail("unexpected list"); },
      async appendLog() { assert.fail("unexpected appendLog"); },
    },
    now: () => now,
  } satisfies PomeloMeshDeps;
  return { deps, records, projectTags, call: (name: string, args: Record<string, unknown>) => pomeloMeshCall(deps, sid, lane, name, args) };
}

test("open_thread creates a session with its prompt, tags and parent", async (t) => {
  const { call, deps } = rig(t);
  assert.deepEqual(await call("open_thread", { title: " Release notes ", prompt: " Draft the notes. ", tags: [" Docs / Release ", "docs-release"] }), {
    output: 'Opened thread "Release notes" (child).',
  });
  assert.deepEqual(deps.createThread.mock.calls.map((c) => c.arguments), [[{
    title: "Release notes", prompt: "Draft the notes.", projectTags: ["docs-release"],
    openedBy: lane, parentThreadId: sid, lastActivityAt: now,
  }]]);
});

test("spawn_subagent adds a lane with its prompt, purpose and caller", async (t) => {
  const { call, deps } = rig(t);
  assert.deepEqual(await call("spawn_subagent", { purpose: " Review docs ", prompt: " Check the examples. ", tool: " codex " }), {
    output: 'Spawned subagent "Reviewer".',
  });
  assert.deepEqual(deps.addLane.mock.calls.map((c) => c.arguments), [[sid, {
    purpose: "Review docs", prompt: "Check the examples.", tool: "codex", spawnedBy: lane, status: "waiting",
  }]]);
});

test("tag_project upserts normalized tags and adds their slugs to the calling session", async (t) => {
  const { call, deps, records, projectTags } = rig(t);
  records.set("tag:release-notes", { slug: "release-notes", label: "release notes", colour: "blue", createdBy: "first" });
  const args = { tags: [" Release Notes ", "Review / Docs", "Review Docs"] };
  for (let repeat = 0; repeat < 2; repeat++) {
    assert.deepEqual(await call("tag_project", args), { output: "Tagged this thread: release-notes, review-docs." });
  }
  assert.deepEqual([...records], [
    ["tag:release-notes", { slug: "release-notes", label: "Release Notes", colour: "blue", createdBy: "first" }],
    ["tag:review-docs", { slug: "review-docs", label: "Review Docs", createdBy: lane }],
  ]);
  assert.deepEqual(deps.addProjectTags.mock.calls.map((c) => c.arguments), [
    [sid, ["release-notes", "review-docs"]], [sid, ["release-notes", "review-docs"]],
  ]);
  assert.deepEqual(projectTags.get(sid), ["existing", "release-notes", "review-docs"]);
});

test("each tool returns its argument-check errors without changing records", async (t) => {
  const { call, deps } = rig(t);
  const thread = { title: "Release notes", prompt: "Draft the notes." };
  const subagent = { purpose: "Review docs", prompt: "Check the examples." };
  const invalidTags = [undefined, "Docs", [], Array(9).fill("Docs"), [false], [" "], ["x".repeat(33)]];
  const checks = [
    { name: "open_thread", check: openThreadAsk, invalid: [
      { ...thread, title: " " }, { ...thread, title: "x".repeat(121) },
      { ...thread, prompt: false }, { ...thread, prompt: "x".repeat(5001) },
      ...invalidTags.slice(1).map((tags) => ({ ...thread, tags })),
    ] },
    { name: "spawn_subagent", check: spawnSubagentAsk, invalid: [
      { ...subagent, purpose: " " }, { ...subagent, purpose: "x".repeat(121) },
      { ...subagent, prompt: false }, { ...subagent, prompt: "x".repeat(5001) },
      { ...subagent, tool: null }, { ...subagent, tool: "x".repeat(33) },
    ] },
    { name: "tag_project", check: tagProjectAsk, invalid: invalidTags.map((tags) => ({ tags })) },
  ];
  for (const { name, check, invalid } of checks) {
    for (const args of invalid) {
      const output = check(args);
      assert.equal(typeof output, "string", name);
      assert.deepEqual(await call(name, args), { output, isError: true }, name);
    }
  }
  assert.equal(deps.createThread.mock.callCount(), 0);
  assert.equal(deps.addLane.mock.callCount(), 0);
  assert.equal(deps.store.set.mock.callCount(), 0);
  assert.equal(deps.addProjectTags.mock.callCount(), 0);
});

test("an unusable tag slug is rejected before creating a thread or writing any tags", async (t) => {
  const { call, deps } = rig(t);
  const tags = ["Docs", "!!!"];
  for (const result of [await call("tag_project", { tags }), await call("open_thread", { title: "Docs", prompt: "Review", tags })]) {
    assert.equal(result?.isError, true);
    assert.match(result?.output ?? "", /tag.*letter or number/i);
  }
  assert.equal(deps.createThread.mock.callCount(), 0);
  assert.equal(deps.store.set.mock.callCount(), 0);
  assert.equal(deps.addProjectTags.mock.callCount(), 0);
});

test("dependency failures are returned as tool errors", async (t) => {
  const { call, deps } = rig(t);
  deps.createThread.mock.mockImplementation(async () => { throw new Error("create failed"); });
  deps.addLane.mock.mockImplementation(async () => { throw new Error("add lane failed"); });
  deps.store.set.mock.mockImplementationOnce(async () => { throw new Error("write failed"); });
  assert.equal((await call("open_thread", { title: "Docs", prompt: "Review" }))?.isError, true);
  assert.equal((await call("spawn_subagent", { purpose: "Docs", prompt: "Review" }))?.isError, true);
  assert.equal((await call("tag_project", { tags: ["Docs"] }))?.isError, true);
  assert.equal(deps.addProjectTags.mock.callCount(), 0);

  deps.addProjectTags.mock.mockImplementationOnce(async () => { throw new Error("attach failed"); });
  assert.equal((await call("tag_project", { tags: ["Docs"] }))?.isError, true);
  assert.deepEqual(await call("tag_project", { tags: ["Docs"] }), { output: "Tagged this thread: docs." });
});

test("an unknown tool falls through to Friday", async (t) => {
  const { call } = rig(t);
  assert.equal(await call("list_agents", {}), null);
});

test("AgentMesh lists and routes Pomelo tools when configured and keeps Friday's existing behavior", async (t) => {
  const { deps } = rig(t);
  const store = { state: async () => project(sid, []), events: async () => [] };
  const mesh = new AgentMesh(store as never, null as never);
  const baseline = meshListing(false);
  const listAgents = { output: "You are the only agent in this session." };
  const args = { title: "Docs", prompt: "Review" };

  assert.equal(mesh.pomelo, null);
  assert.deepEqual(await mesh.listingFor(sid, false), baseline);
  assert.deepEqual(await mesh.call(sid, MAIN_LANE, "list_agents", {}), listAgents);
  assert.deepEqual(await mesh.call(sid, MAIN_LANE, "open_thread", args), {
    output: "Friday has no tool called open_thread.", isError: true,
  });

  mesh.pomelo = { tools: POMELO_MESH_TOOLS, call: (sid, lane, name, args) => pomeloMeshCall(deps, sid, lane, name, args) };
  assert.deepEqual(await mesh.listingFor(sid, false), { ...baseline, tools: [...baseline.tools, ...POMELO_MESH_TOOLS] });
  assert.deepEqual(meshListing(false), baseline);
  assert.deepEqual(await mesh.call(sid, MAIN_LANE, "open_thread", args), { output: 'Opened thread "Docs" (child).' });
  assert.equal(deps.createThread.mock.calls[0]?.arguments[0].openedBy, MAIN_LANE);
  assert.deepEqual(await mesh.call(sid, MAIN_LANE, "list_agents", {}), listAgents);
});
