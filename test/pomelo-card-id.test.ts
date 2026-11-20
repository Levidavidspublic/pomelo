import assert from "node:assert/strict";
import { test } from "node:test";
import { assignCardIds, type CardIdInput } from "../src/pomelo/card-id.js";

const diagrams = [{ kind: "diagram" }, { kind: "diagram" }] as const;

function assigned(cards: readonly CardIdInput[], messageId = "message-1", threadId = "thread-1") {
  const result = assignCardIds(threadId, messageId, cards);
  assert.ok(result.ok);
  return result.cards;
}

test("assigns each kind a stable ID in reply order without mutating the input", () => {
  const kinds = ["diagram", "artifact", "image", "chart", "widget"];
  const input = Object.freeze(kinds.map((kind) => Object.freeze({ kind })));
  const cards = assigned(input);

  assert.deepEqual(cards.map(({ kind }) => kind), kinds);
  assert.deepEqual(assigned(input), cards);
  assert.deepEqual(assigned(cards), cards);
  assert.equal(new Set(cards.map(({ id }) => id)).size, cards.length);
  for (const { id } of cards) assert.match(id, /^[a-z0-9_-]{1,40}$/);
  assert.deepEqual(input, kinds.map((kind) => ({ kind })));
  assert.deepEqual(assigned([]), []);
});

test("builds IDs from the thread, message, kind, and position within that kind", () => {
  const [first, second] = assigned(diagrams);
  assert.equal(first.id, "e179c82798ce2bc14d8d68bb529194f9");
  assert.notEqual(second.id, first.id);
  assert.notEqual(assigned(diagrams, "message-2")[0].id, first.id);
  assert.notEqual(assigned(diagrams, "message-1", "thread-2")[0].id, first.id);

  const chart = { kind: "chart" };
  assert.deepEqual(assigned([chart, diagrams[0], chart, diagrams[1]]).filter(({ kind }) => kind === "diagram"), [first, second]);
  assert.deepEqual(assigned([...diagrams, chart, diagrams[0]]).slice(0, 2), [first, second]);
});

test("keeps a safe agent ID once across all card kinds", () => {
  const id = `widget-0_${"a".repeat(31)}`;
  const widget = { kind: "widget", id };
  const result = assigned([widget, { kind: "chart", id }, { kind: "image", id: "x" }]);

  assert.deepEqual(result, [widget, ...assigned([{ kind: "chart" }]), { kind: "image", id: "x" }]);
});

test("uses the generated ID for unsafe agent IDs, including Hebrew text", () => {
  const expected = assigned([diagrams[0]]);
  for (const id of ["", "x".repeat(41), "two/parts", "two parts", "a\u0000b", "trailing\n", "Upper", "תרשים"]) {
    assert.deepEqual(assigned([{ kind: "diagram", id }]), expected, JSON.stringify(id));
  }
});

test("resolves collisions between agent and generated IDs without changing earlier cards", () => {
  const [diagram] = assigned([diagrams[0]]);
  const widget = { kind: "widget", id: diagram.id };

  assert.deepEqual(assigned([diagram, widget]), [diagram, ...assigned([{ kind: "widget" }])]);

  const withWidgetFirst = assigned([widget, diagrams[0]]);
  assert.deepEqual(withWidgetFirst.slice(0, 1), assigned([widget]));
  assert.notEqual(withWidgetFirst[1].id, widget.id);
  assert.match(withWidgetFirst[1].id, /^[a-z0-9_-]{1,40}$/);
  assert.deepEqual(assigned([widget, diagrams[0]]), withWidgetFirst);
});

test("refuses blank thread or message IDs and unknown card kinds with a reason", () => {
  const failures = [
    [assignCardIds("", "message-1", diagrams), /thread id/i],
    [assignCardIds(" \t", "message-1", diagrams), /thread id/i],
    [assignCardIds("thread-1", "", diagrams), /message id/i],
    [assignCardIds("thread-1", " \n", diagrams), /message id/i],
    [assignCardIds("thread-1", "message-1", [...diagrams, { kind: "other" }]), /kind/i],
  ] as const;

  for (const [result, reason] of failures) {
    assert.equal(result.ok, false);
    assert.match(result.reason, reason);
    assert.deepEqual(result, { ok: false, reason: result.reason });
  }
});
