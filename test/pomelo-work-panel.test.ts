import assert from "node:assert/strict";
import test from "node:test";
import {
  pomeloWorkPanel, type LaneLike, type ToolCallLike,
} from "../src/client/pomelo/work-panel.js";

test("the work panel shows the lane's driver and the reported model", () => {
  const lanes: LaneLike[] = [
    { id: "claude", name: "Research", engine: { tool: "claude", model: "claude-model" }, tool: "codex", state: "running" },
    { id: "codex", name: "Build", engine: true, tool: "Codex", model: "codex-model", state: "running" },
    { id: "opencode", name: "Review", engine: { tool: "opencode" }, state: "running" },
    { id: "unknown", name: "Check", engine: { tool: "unknown" }, state: "running" },
    { id: "display-name", name: "Draft", tool: "Claude Code", state: "running" },
  ];

  const sections = pomeloWorkPanel(lanes, []);
  assert.deepEqual(sections.map(({ laneId, name, driver, model }) => ({ laneId, name, driver, model })), [
    { laneId: "claude", name: "Research", driver: "claude", model: "claude-model" },
    { laneId: "codex", name: "Build", driver: "codex", model: "codex-model" },
    { laneId: "opencode", name: "Review", driver: "opencode", model: "not reported" },
    { laneId: "unknown", name: "Check", driver: "other", model: "not reported" },
    { laneId: "display-name", name: "Draft", driver: "claude", model: "not reported" },
  ]);
});

test("tool call rows contain only display metadata for their own lane", () => {
  const canary = "work-panel-test-canary";
  const lanes: LaneLike[] = [
    { id: "main", name: "Main", state: "running" },
    { id: "helper", name: "Helper", state: "waiting" },
  ];
  const calls = [
    {
      id: "first",
      laneId: "main",
      name: "read_file",
      state: "done",
      startedAt: 10,
      arguments: JSON.stringify({ text: canary }),
      args: { text: canary },
      input: canary,
      result: canary,
      output: canary,
    },
    { id: "second", laneId: "helper", name: "list_files", state: "waiting", startedAt: 20 },
    { id: "unlisted", laneId: "absent", name: "read_file", state: "failed", startedAt: 30 },
  ] as const;

  const result = pomeloWorkPanel(lanes, calls);

  assert.deepEqual(result.map((section) => section.calls), [
    [{ id: "first", tool: "read_file", state: "done", startedAt: 10 }],
    [{ id: "second", tool: "list_files", state: "waiting", startedAt: 20 }],
  ]);
  assert.equal(JSON.stringify(result).includes(canary), false);
});

test("lanes sort by state and then by the newest lane or call activity", () => {
  const lanes: LaneLike[] = [
    { id: "done", name: "Done", state: "done", lastActivityAt: 100 },
    { id: "running-old", name: "Earlier run", state: "running", lastActivityAt: 10 },
    { id: "stuck", name: "Stuck", state: "stuck", lastActivityAt: 90 },
    { id: "waiting-old", name: "Earlier wait", state: "waiting", lastActivityAt: 40 },
    { id: "running-new", name: "Later run", state: "running", lastActivityAt: 5 },
    { id: "waiting-new", name: "Later wait", state: "waiting", lastActivityAt: 50 },
  ];
  const calls: ToolCallLike[] = [
    { id: "latest", laneId: "running-new", name: "read_file", state: "running", startedAt: 20 },
    { id: "older", laneId: "waiting-new", name: "list_files", state: "done", startedAt: 15 },
  ];

  const sections = pomeloWorkPanel(lanes, calls);
  assert.deepEqual(sections.map(({ laneId, state }) => [laneId, state]), [
    ["running-new", "running"],
    ["running-old", "running"],
    ["waiting-new", "waiting"],
    ["waiting-old", "waiting"],
    ["stuck", "stuck"],
    ["done", "done"],
  ]);
  assert.equal(lanes[0].id, "done");
});

test("each lane keeps its newest 50 calls and counts the rest", () => {
  const lanes: LaneLike[] = [
    { id: "busy", name: "Busy", state: "running" },
    { id: "quiet", name: "Quiet", state: "waiting" },
  ];
  const calls: ToolCallLike[] = Array.from({ length: 53 }, (_, index) => ({
    id: `call-${index + 1}`,
    laneId: "busy",
    name: "read_file",
    state: "done",
    startedAt: index + 1,
  }));
  calls.splice(1, 0, { id: "quiet-call", laneId: "quiet", name: "list_files", state: "waiting", startedAt: 55 });

  const [busy, quiet] = pomeloWorkPanel(lanes, calls);
  assert.deepEqual(busy.calls.map((call) => call.startedAt), Array.from({ length: 50 }, (_, index) => 53 - index));
  assert.equal(busy.moreCalls, 3);
  assert.deepEqual(quiet.calls.map((call) => call.id), ["quiet-call"]);
  assert.equal(quiet.moreCalls, 0);
  assert.equal(calls[0].id, "call-1");
});

test("lanes with no calls have empty lists and no lanes gives no sections", () => {
  assert.deepEqual(pomeloWorkPanel([{ id: "main", name: "Main", state: "waiting" }], []), [
    { laneId: "main", name: "Main", driver: "other", model: "not reported", state: "waiting", calls: [], moreCalls: 0 },
  ]);
  assert.deepEqual(pomeloWorkPanel([], []), []);
});
