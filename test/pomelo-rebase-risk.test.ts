import assert from "node:assert/strict";
import test from "node:test";
import { rebaseRisk } from "../src/pomelo/rebase-risk.js";

test("reports no risk when upstream only adds a patched file or changes an unpatched file", () => {
  assert.deepEqual(rebaseRisk({
    patchedFiles: ["src/agent-mesh.ts"],
    upstreamChanges: [
      { path: "src/app.ts", status: "modified" },
      { path: "src/agent-mesh.ts", status: "added" },
      { path: "src/agents.ts", status: "renamed", to: "src/agent-mesh.ts" },
    ],
  }), {
    ok: true,
    atRisk: [],
    summary: "No hook is touched by this release.",
  });
});

test("reports a modified Friday hook and counts all patched Friday files", () => {
  assert.deepEqual(rebaseRisk({
    patchedFiles: ["src/agent-mesh.ts", "src/app.ts", "src/threads.ts"],
    upstreamChanges: [{ path: "src/agent-mesh.ts", status: "modified" }],
  }), {
    ok: false,
    atRisk: [{ path: "src/agent-mesh.ts", risk: "changed" }],
    summary: "1 of 3 hooks need a look: 1 changed.",
  });
});

test("orders risks by severity and then by path", () => {
  assert.deepEqual(rebaseRisk({
    patchedFiles: ["src/agent-mesh.ts", "src/app.ts", "src/threads.ts", "src/skills.ts", "src/bus.ts"],
    upstreamChanges: [
      { path: "src/skills.ts", status: "modified" },
      { path: "src/threads.ts", status: "renamed", to: "src/session/threads.ts" },
      { path: "src/app.ts", status: "deleted" },
      { path: "src/agent-mesh.ts", status: "modified" },
    ],
  }), {
    ok: false,
    atRisk: [
      { path: "src/app.ts", risk: "deleted" },
      { path: "src/threads.ts", risk: "renamed", movedTo: "src/session/threads.ts" },
      { path: "src/agent-mesh.ts", risk: "changed" },
      { path: "src/skills.ts", risk: "changed" },
    ],
    summary: "4 of 5 hooks need a look: 1 deleted, 1 renamed, 2 changed.",
  });
});

test("normalizes backslashes and keeps the worst risk per patched path", () => {
  const patchedFiles = Object.freeze([
    "src/agent-mesh.ts", "src/agent-mesh.ts", "src\\agent-mesh.ts", "src/app.ts", "src/threads.ts",
  ]);
  const upstreamChanges = Object.freeze([
    Object.freeze({ path: "src/agent-mesh.ts", status: "modified" }),
    Object.freeze({ path: "src/agent-mesh.ts", status: "renamed" }),
    Object.freeze({ path: "src\\agent-mesh.ts", status: "renamed", to: "src\\agent\\mesh.ts" }),
    Object.freeze({ path: "src/app.ts", status: "deleted" }),
    Object.freeze({ path: "src\\app.ts", status: "renamed", to: "src\\app-tools.ts" }),
  ] as const);
  assert.deepEqual(rebaseRisk({ patchedFiles, upstreamChanges }), {
    ok: false,
    atRisk: [
      { path: "src/app.ts", risk: "deleted" },
      { path: "src/agent-mesh.ts", risk: "renamed", movedTo: "src/agent/mesh.ts" },
    ],
    summary: "2 of 3 hooks need a look: 1 deleted, 1 renamed.",
  });
});

test("excludes both Pomelo directories and reports a rename with no destination supplied", () => {
  assert.deepEqual(rebaseRisk({
    patchedFiles: ["src/pomelo/rebase-risk.ts", "src\\client\\pomelo\\panel.tsx", "src/app.ts"],
    upstreamChanges: [
      { path: "src/pomelo/rebase-risk.ts", status: "deleted" },
      { path: "src/client/pomelo/panel.tsx", status: "modified" },
      { path: "src/app.ts", status: "renamed" },
    ],
  }), {
    ok: false,
    atRisk: [{ path: "src/app.ts", risk: "renamed" }],
    summary: "1 of 1 hooks need a look: 1 renamed.",
  });
});
