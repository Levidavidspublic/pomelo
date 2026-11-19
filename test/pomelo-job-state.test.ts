import assert from "node:assert/strict";
import test from "node:test";
import { checkJobMove, isFinal, releasesLock } from "../src/pomelo/browser/job-state.js";

const states = ["queued", "running", "waiting", "done", "failed", "cancelled"] as const;
const actors = ["worker", "amit", "agent"] as const;

type State = (typeof states)[number];
type MoveTable = Record<State, readonly State[]>;

const workerAndAmitMoves: MoveTable = {
  queued: ["running", "cancelled"],
  running: ["waiting", "done", "failed", "cancelled"],
  waiting: ["running", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: [],
};
const agentMoves: MoveTable = {
  ...workerAndAmitMoves,
  running: ["waiting", "cancelled"],
  waiting: ["running", "cancelled"],
};

for (const by of actors) {
  test(`checks every browser job transition by ${by}`, () => {
    const allowed = by === "agent" ? agentMoves : workerAndAmitMoves;
    for (const from of states) {
      for (const to of states) {
        const result = checkJobMove({ from, to, by });
        const move = `${by}: ${from} -> ${to}`;
        if (from === to) {
          assert.deepEqual(result, { ok: true, reason: "no_change" }, move);
        } else {
          assert.equal(result.ok, allowed[from].includes(to), move);
        }
      }
    }
  });
}

test("queued and waiting jobs must run before being marked done", () => {
  for (const from of ["queued", "waiting"]) {
    assert.deepEqual(checkJobMove({ from, to: "done", by: "worker" }), { ok: false, reason: "must_run_first" });
  }
});

test("agents cannot mark a browser job done or failed", () => {
  const forbidden = { ok: false, reason: "not_allowed_for_agent" };
  assert.deepEqual(checkJobMove({ from: "running", to: "done", by: "agent" }), forbidden);
  assert.deepEqual(checkJobMove({ from: "running", to: "failed", by: "agent" }), forbidden);
  assert.deepEqual(checkJobMove({ from: "waiting", to: "failed", by: "agent" }), forbidden);
});

test("agents can cancel any active browser job", () => {
  for (const from of ["queued", "running", "waiting"]) {
    assert.equal(checkJobMove({ from, to: "cancelled", by: "agent" }).ok, true);
  }
});

test("unknown states and actors return bad_input", () => {
  const move = { from: "running", to: "running", by: "worker" };
  for (const input of [
    { ...move, from: "deleted" },
    { ...move, to: "deleted" },
    { ...move, from: "constructor", to: "constructor" },
    { ...move, by: "unknown" },
    { ...move, by: "constructor" },
    { ...move, to: null },
    { from: "queued", to: "running" },
    null,
  ]) {
    assert.deepEqual(checkJobMove(input), { ok: false, reason: "bad_input" });
  }
});

test("only final browser jobs release the profile lock", () => {
  const finalStates = ["done", "failed", "cancelled"];
  for (const state of [...states, "unknown"]) {
    assert.equal(isFinal(state), finalStates.includes(state), state);
    assert.equal(releasesLock(state), finalStates.includes(state), state);
  }
});
