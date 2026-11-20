import assert from "node:assert/strict";
import test from "node:test";
import { mayMoveFocus, type FocusChange, type FocusState } from "../src/client/pomelo/focus-keep.js";

const idle: FocusState = {
  focus: "none",
  hasUnsentText: false,
  composing: false,
  now: 10_000,
  lastTextAt: 8_000,
};
const openThread = { kind: "thread-opened-by-user", cause: "user-key" } satisfies FocusChange;
const openPanel = { kind: "panel-opened", cause: "user-pointer" } satisfies FocusChange;

test("an agent-opened thread announces politely while the composer is in use", () => {
  const answer = mayMoveFocus({ kind: "thread-opened-by-agent", cause: "agent" }, {
    ...idle,
    focus: "composer",
    hasUnsentText: true,
    lastTextAt: 9_500,
  });
  assert.equal(answer.move, false);
  assert.equal(answer.target, undefined);
  assert.equal(answer.announce, "polite");
  assert.ok(answer.reason);
});

test("a card arriving from the system announces politely without moving focus", () => {
  const answer = mayMoveFocus({ kind: "card-arrived", cause: "system" }, idle);
  assert.equal(answer.move, false);
  assert.equal(answer.target, undefined);
  assert.equal(answer.announce, "polite");
  assert.ok(answer.reason);
});

test("a panel opened by an agent announces politely without moving focus", () => {
  const answer = mayMoveFocus({ kind: "panel-opened", cause: "agent" }, idle);
  assert.equal(answer.move, false);
  assert.equal(answer.announce, "polite");
});

test("Enter on a rail row can focus the opened thread's composer", () => {
  const answer = mayMoveFocus(openThread, { ...idle, focus: "rail" });
  assert.equal(answer.move, true);
  assert.equal(answer.target, "composer");
});

test("clicking a card can focus the panel it opened", () => {
  const answer = mayMoveFocus(openPanel, { ...idle, focus: "card" });
  assert.equal(answer.move, true);
  assert.equal(answer.target, "panel");
});

test("a panel opened by a pointer leaves focus in the composer during composition", () => {
  const answer = mayMoveFocus(openPanel, { ...idle, focus: "composer", composing: true });
  assert.equal(answer.move, false);
  assert.equal(answer.target, undefined);
  assert.match(answer.reason, /composing/i);
});

test("a key cannot move focus during the quiet window even when a different control was acted on", () => {
  const answer = mayMoveFocus(openThread, { ...idle, focus: "rail", lastTextAt: 9_500, quietMs: 1_500 });
  assert.equal(answer.move, false);
  assert.equal(answer.target, undefined);
  assert.match(answer.reason, /quiet/i);
});

test("a pointer can move focus two seconds after typing, even with an unsent draft", () => {
  const answer = mayMoveFocus(openPanel, { ...idle, focus: "composer", hasUnsentText: true, quietMs: 1_500 });
  assert.equal(answer.move, true);
  assert.equal(answer.target, "panel");
});

test("the default quiet window ends at 1500 ms", () => {
  assert.equal(mayMoveFocus(openPanel, { ...idle, lastTextAt: 8_501 }).move, false);
  assert.equal(mayMoveFocus(openPanel, { ...idle, lastTextAt: 8_500 }).move, true);
});

test("an explicit quiet window overrides the default", () => {
  assert.equal(mayMoveFocus(openThread, { ...idle, lastTextAt: 9_500, quietMs: 400 }).move, true);
  assert.equal(mayMoveFocus(openThread, { ...idle, quietMs: 2_500 }).move, false);
});

test("focus outside Pomelo stays outside for every cause", () => {
  const causes = ["user-key", "user-pointer", "agent", "system"] as const;
  for (const cause of causes) {
    const answer = mayMoveFocus({ kind: "panel-opened", cause }, { ...idle, focus: "outside-app" });
    assert.equal(answer.move, false, cause);
    assert.equal(answer.target, undefined, cause);
    assert.match(answer.reason, /outside/i, cause);
    if (cause === "agent" || cause === "system") assert.equal(answer.announce, "polite");
  }
});

test("approval cards announce politely even after a user action", () => {
  for (const cause of ["agent", "user-pointer"] as const) {
    const answer = mayMoveFocus({ kind: "approval-card-shown", cause }, idle);
    assert.equal(answer.move, false);
    assert.equal(answer.target, undefined);
    assert.equal(answer.announce, "polite");
    assert.match(answer.reason, /approval/i);
  }
});

test("notices announce politely without a focus target", () => {
  const answer = mayMoveFocus({ kind: "notice-shown", cause: "user-key" }, idle);
  assert.equal(answer.move, false);
  assert.equal(answer.target, undefined);
  assert.equal(answer.announce, "polite");
});

test("direct user actions on a rail row or card can focus that item", () => {
  const row = mayMoveFocus({ kind: "rail-updated", cause: "user-key" }, idle);
  assert.equal(row.move, true);
  assert.equal(row.target, "rail-row");
  const card = mayMoveFocus({ kind: "card-arrived", cause: "user-pointer" }, idle);
  assert.equal(card.move, true);
  assert.equal(card.target, "card");
});

test("an unknown kind cannot move focus and gets a reason", () => {
  const answer = mayMoveFocus({ ...openThread, kind: "unknown-change" as FocusChange["kind"] }, idle);
  assert.equal(answer.move, false);
  assert.equal(answer.target, undefined);
  assert.match(answer.reason, /unknown/i);
});
