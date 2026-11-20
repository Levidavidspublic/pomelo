import assert from "node:assert/strict";
import test from "node:test";
import { meshReply, type MeshReplyReason, type MeshReplyStatus } from "../src/pomelo/mesh-reply.js";

const failed = { ok: false, status: "failed", text: "The mesh tool failed." };
const thread = { tool: "open_thread", status: "opened", id: "Thread_1" } as const;
const opened = { ok: true, status: "opened", id: thread.id, text: "Opened a new thread." };
const canary = "pomelo-mesh-test-canary";

test("each mesh tool returns its status, ID and fixed success text", () => {
  assert.deepEqual(meshReply(thread), opened);
  assert.deepEqual(meshReply({ tool: "spawn_subagent", status: "spawned", id: "Lane-1" }), {
    ok: true, status: "spawned", id: "Lane-1", text: "Spawned a sub-agent.",
  });
  assert.deepEqual(meshReply({ tool: "tag_project", status: "tagged", id: thread.id }), {
    ok: true, status: "tagged", id: thread.id, text: "Tagged this thread.",
  });
});

test("reusing a thread or lane succeeds without asking the agent to retry", () => {
  assert.deepEqual(meshReply({ ...thread, status: "reused" }), {
    ok: true, status: "reused", id: thread.id, text: "Reused the earlier thread, so there is no need to retry.",
  });
  assert.deepEqual(meshReply({ tool: "spawn_subagent", status: "reused", id: "Lane-1" }), {
    ok: true, status: "reused", id: "Lane-1", text: "Reused the earlier lane, so there is no need to retry.",
  });
});

const refusals = {
  not_main_agent: ["open_thread", "Ask the main agent to open the thread."],
  too_many_open_children: ["open_thread", "Wait for a child thread to close before opening another."],
  too_many_per_window: ["open_thread", "Wait before opening another thread."],
  too_many_running: ["spawn_subagent", "Wait for a sub-agent to finish before spawning another."],
  too_deep: ["spawn_subagent", "Ask the main agent to spawn the sub-agent."],
  bad_input: ["spawn_subagent", "Check the tool inputs before trying again."],
  too_many_tags: ["tag_project", "Ask Amit which project tag to replace."],
  too_many_per_run: ["tag_project", "Use an existing project tag or wait until the next run."],
  too_many_per_hour: ["tag_project", "Wait for the hourly project limit to reset."],
  empty: ["tag_project", "Enter a nonempty project name."],
  "not-text": ["tag_project", "Provide the project name as text."],
  "looks-secret": ["tag_project", "Choose a project name that contains no credentials."],
} satisfies Record<MeshReplyReason, [string, string]>;

for (const reason of Object.keys(refusals) as MeshReplyReason[]) {
  const [tool, text] = refusals[reason];
  test(`refusal ${reason} returns a fixed next step`, () => {
    assert.deepEqual(meshReply({ tool, status: "refused", reason }), { ok: false, status: "refused", text });
  });
}

test("replies can omit the ID and a refusal can omit its reason", () => {
  assert.deepEqual(meshReply({ tool: "tag_project", status: "tagged" }), {
    ok: true, status: "tagged", text: "Tagged this thread.",
  });
  assert.deepEqual(meshReply({ tool: "open_thread", status: "refused" }), {
    ok: false, status: "refused", text: "Ask Amit how to proceed.",
  });
  assert.deepEqual(meshReply({ tool: "open_thread", status: "failed" }), failed);
});

test("unknown tools, statuses and reasons use the generic failed reply", () => {
  for (const unknown of [canary, "constructor", "__proto__"]) {
    assert.deepEqual(meshReply({ ...thread, tool: unknown }), failed);
    assert.deepEqual(meshReply({ ...thread, status: unknown as MeshReplyStatus }), failed);
    const reason = unknown as MeshReplyReason;
    assert.deepEqual(meshReply({ ...thread, status: "refused", reason }), failed);
    assert.deepEqual(meshReply({ ...thread, reason }), failed);
  }
});

test("only IDs in Friday's session ID format are returned", () => {
  for (const id of ["abc_", "a".repeat(40)]) {
    assert.deepEqual(meshReply({ ...thread, id }), { ...opened, id });
  }
  for (const id of ["thread/1", "thread\\1", "thread 1", "thread..1", "thread\n", "", "abc", "a".repeat(41)]) {
    assert.deepEqual(meshReply({ ...thread, id }), failed);
  }
});

test("details and invalid IDs keep the canary out of the serialized reply", () => {
  try {
    throw new Error(canary);
  } catch (error) {
    for (const detail of [canary, error, { path: `/home/example/${canary}` }, canary.repeat(500)]) {
      const reply = meshReply({ ...thread, detail });
      assert.deepEqual(reply, opened);
      assert.equal(JSON.stringify(reply).includes(canary), false);
    }
  }

  const reply = meshReply({ ...thread, id: `invalid/${canary}` });
  assert.deepEqual(reply, failed);
  assert.equal(JSON.stringify(reply).includes(canary), false);
});
