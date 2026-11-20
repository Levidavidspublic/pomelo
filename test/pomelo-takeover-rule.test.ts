import assert from "node:assert/strict";
import test from "node:test";
import { takeoverStep, type TakeoverEvent, type TakeoverState } from "../src/pomelo/browser/takeover-rule.js";

const initial: TakeoverState = Object.freeze({ driver: "agent", pageChangedSinceTakeOver: false });
const click = { type: "agent_action", kind: "click" } as const;
const takeOver = { type: "amit_take_over" } as const;
const handBack = { type: "amit_hand_back" } as const;

test("allows the agent to click while driving and returns a fresh state", () => {
  const result = takeoverStep(initial, click, 10);
  assert.deepEqual(result, { allow: true, next: initial, mustReread: false });
  assert.notEqual(result.next, initial);
});

test("refuses every agent action while Amit drives", () => {
  const taken = takeoverStep(initial, takeOver, 20);
  assert.deepEqual(taken, {
    allow: true, next: { driver: "amit", takenAt: 20, pageChangedSinceTakeOver: false }, mustReread: false,
  });
  for (const kind of ["click", "type", "fill", "navigate", "script", "screenshot", "import"] as const) {
    const result = takeoverStep(taken.next, { type: "agent_action", kind }, 21);
    assert.deepEqual(result, { allow: false, hold: "Amit is driving", next: taken.next, mustReread: false });
    assert.notEqual(result.next, taken.next);
  }
  assert.equal(takeoverStep(taken.next, { type: "agent_reread", startedAt: 21 }, 22).allow, false);
});

test("a duplicate take-over preserves the original time and any page change", () => {
  const taken = takeoverStep(initial, takeOver, 20).next;
  const changed = Object.freeze({ ...taken, pageChangedSinceTakeOver: true });
  const duplicate = takeoverStep(changed, takeOver, 25);
  assert.deepEqual(duplicate, { allow: true, next: changed, mustReread: false });
  assert.notEqual(duplicate.next, changed);
});

test("hands an unchanged page back to the agent", () => {
  const taken = takeoverStep(initial, takeOver, 20).next;
  const returned = takeoverStep(taken, handBack, 30);
  assert.deepEqual(returned, {
    allow: true,
    next: { driver: "agent", takenAt: 20, handedBackAt: 30, pageChangedSinceTakeOver: false },
    mustReread: false,
  });
  assert.equal(takeoverStep(returned.next, click, 31).allow, true);
});

test("blocks agent actions until a fresh masked read after hand-back", () => {
  const taken = takeoverStep(initial, takeOver, 20).next;
  const returned = takeoverStep({ ...taken, pageChangedSinceTakeOver: true }, handBack, 30);
  assert.equal(returned.allow, true);
  assert.equal(returned.mustReread, true);
  assert.equal(returned.next.driver, "agent");

  const duplicate = takeoverStep(returned.next, handBack, 31);
  assert.deepEqual(duplicate.next, returned.next);
  assert.equal(duplicate.mustReread, true);

  const blocked = takeoverStep(duplicate.next, click, 31);
  assert.equal(blocked.allow, false);
  assert.equal(blocked.mustReread, true);
  const stale = takeoverStep(blocked.next, { type: "agent_reread", startedAt: 29 }, 32);
  assert.equal(stale.allow, false);
  assert.equal(stale.mustReread, true);

  const reread = takeoverStep(stale.next, { type: "agent_reread", startedAt: 32 }, 33);
  assert.equal(reread.allow, true);
  assert.equal(reread.mustReread, false);
  assert.equal(reread.next.pageChangedSinceTakeOver, false);
  assert.equal(takeoverStep(reread.next, click, 34).allow, true);
});

test("preserves the fresh-read requirement across another take-over", () => {
  const taken = takeoverStep(initial, takeOver, 20).next;
  const returned = takeoverStep({ ...taken, pageChangedSinceTakeOver: true }, handBack, 30).next;
  const takenAgain = takeoverStep(returned, takeOver, 35).next;
  const returnedAgain = takeoverStep(takenAgain, handBack, 40);
  assert.equal(returnedAgain.mustReread, true);
  const stale = takeoverStep(returnedAgain.next, { type: "agent_reread", startedAt: 31 }, 41);
  assert.equal(stale.allow, false);
  assert.equal(stale.mustReread, true);
});

test("an interrupted fill or import requires a new approval after hand-back", () => {
  for (const kind of ["fill", "import"] as const) {
    const step = { type: "agent_action", kind, approvedAt: 15 } as const;
    const inFlight = takeoverStep(initial, step, 16);
    assert.equal(inFlight.allow, true);
    const taken = takeoverStep(inFlight.next, takeOver, 20);
    const returned = takeoverStep(taken.next, handBack, 30);
    assert.equal(takeoverStep(returned.next, step, 32).allow, false);
    assert.equal(takeoverStep(returned.next, { type: "agent_action", kind }, 32).allow, false);
    assert.equal(takeoverStep(returned.next, { ...step, approvedAt: 30 }, 32).allow, false);
    assert.equal(takeoverStep(returned.next, { ...step, approvedAt: 33 }, 32).allow, false);
    assert.equal(takeoverStep(returned.next, { ...step, approvedAt: 31 }, 32).allow, true);
  }
});

test("accepts Amit's input only while he drives and never returns what he typed", () => {
  const canary = "synthetic-manual-input-canary";
  const input = { type: "amit_input", text: canary } as const;
  const taken = takeoverStep(initial, takeOver, 20).next;
  const accepted = takeoverStep(taken, input, 21);
  const refused = takeoverStep(initial, input, 21);
  assert.equal(accepted.allow, true);
  assert.equal(refused.allow, false);
  for (const result of [accepted, refused]) {
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
});

test("refuses unknown events, unknown action kinds, and malformed control states", () => {
  for (const event of [{ type: "unknown" }, { type: "agent_action", kind: "unknown" }, null]) {
    assert.equal(takeoverStep(initial, event as TakeoverEvent, 20).allow, false);
  }
  for (const state of [
    { ...initial, driver: "unknown" },
    { ...initial, pageChangedSinceTakeOver: "false" },
    { ...initial, takenAt: Infinity },
    { ...initial, takenAt: 19, handedBackAt: 18 },
    null,
  ]) {
    assert.equal(takeoverStep(state as TakeoverState, click, 20).allow, false);
    assert.equal(takeoverStep(state as TakeoverState, takeOver, 20).allow, false);
  }
});
