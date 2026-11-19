import assert from "node:assert/strict";
import test from "node:test";
import { bumpActivity, checkThreadOrigin } from "../src/pomelo/activity.js";

const t0 = 1_700_000_000_000;
const thread = Object.freeze({ id: "thread-1", lastActivityAt: t0 });

for (const kind of ["message", "card", "approval", "subagent_result"]) {
  test(`${kind} advances thread activity to its timestamp`, () => {
    assert.deepEqual(bumpActivity(thread, { kind, ts: t0 + 1000 }), { ...thread, lastActivityAt: t0 + 1000 });
  });
}

test("an unknown event kind leaves thread activity unchanged", () => {
  assert.deepEqual(bumpActivity(thread, { kind: "rename", ts: t0 + 1000 }), thread);
});

test("an older event leaves thread activity unchanged", () => {
  assert.deepEqual(bumpActivity(thread, { kind: "message", ts: t0 - 1000 }), thread);
});

test("the first activity sets the timestamp without mutating the thread", () => {
  const legacyThread = Object.freeze({ id: "thread-2" });
  assert.deepEqual(bumpActivity(legacyThread, { kind: "message", ts: t0 }), { id: "thread-2", lastActivityAt: t0 });
  assert.deepEqual(legacyThread, { id: "thread-2" });
});

test("a newer event leaves the original thread unchanged", () => {
  const original = Object.freeze({ id: "thread-3", lastActivityAt: t0, title: "Draft" });
  assert.deepEqual(bumpActivity(original, { kind: "card", ts: t0 + 1000 }), { ...original, lastActivityAt: t0 + 1000 });
  assert.equal(original.lastActivityAt, t0);
});

test("a person or agent can open a thread with or without a parent", () => {
  assert.equal(checkThreadOrigin({ id: "thread-1", openedBy: "person-1" }), true);
  assert.equal(checkThreadOrigin({ id: "thread-1", openedBy: "agent-1", parentThreadId: "thread-2" }), true);
});

test("the opener must be a non-blank string", () => {
  for (const openedBy of ["", "  ", 42, undefined]) {
    assert.equal(checkThreadOrigin({ id: "thread-1", openedBy }), false);
  }
});

test("a supplied parent must be a non-blank id different from the thread's id", () => {
  for (const parentThreadId of ["thread-1", "", "  ", 42]) {
    assert.equal(checkThreadOrigin({ id: "thread-1", openedBy: "agent-1", parentThreadId }), false);
  }
});
