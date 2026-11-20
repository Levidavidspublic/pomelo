import assert from "node:assert/strict";
import test from "node:test";
import { cardDrawn, cardView, emptyCardFailures, failCard, retryCard } from "../src/client/pomelo/card-failure.js";

const diagram = { id: "flow", kind: "diagram", title: "Release steps" } as const;
const chart = { id: "monthly", kind: "chart", title: "Monthly totals" } as const;
const drawError = new Error("Draw failed");

test("all five kinds start ok and a draw failure affects only its card", () => {
  const cards = [
    diagram,
    chart,
    { id: "page", kind: "artifact" },
    { id: "preview", kind: "image" },
    { id: "filter", kind: "widget" },
  ] as const;
  const initial = emptyCardFailures({ cardIds: cards.map(({ id }) => id) });
  for (const card of cards) {
    assert.deepEqual(cardView(initial, card), { state: "ok", fallbackText: "", canRetry: false, label: "" });
    assert.match(cardView(failCard(initial, card, drawError), card).fallbackText, new RegExp(card.kind, "i"));
  }

  const failed = failCard(initial, diagram, drawError);
  const view = cardView(failed, diagram);
  assert.equal(view.state, "failed");
  assert.match(view.fallbackText, /diagram.*Release steps/i);
  assert.equal(view.canRetry, true);
  assert.equal(view.label, "Try again");
  for (const card of cards.slice(1)) assert.equal(cardView(failed, card).state, "ok");
});

test("retrying keeps the fallback visible until a successful draw", () => {
  const initial = emptyCardFailures({ cardIds: [diagram.id], retryLimit: 1 });
  const failed = failCard(initial, diagram, drawError);
  const retrying = retryCard(failed, diagram.id);
  assert.deepEqual(cardView(retrying, diagram), {
    state: "retrying", fallbackText: cardView(failed, diagram).fallbackText, canRetry: false, label: "",
  });
  assert.equal(retryCard(retrying, diagram.id), retrying);

  const drawn = cardDrawn(retrying, diagram.id);
  assert.deepEqual(cardView(drawn, diagram), cardView(initial, diagram));
  assert.equal(cardView(failCard(drawn, diagram, drawError), diagram).canRetry, true);
});

test("two failed retries leave the card as text by default", () => {
  let state = failCard(emptyCardFailures({ cardIds: [diagram.id] }), diagram, drawError);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(cardView(state, diagram).canRetry, true);
    state = failCard(retryCard(state, diagram.id), diagram, drawError);
  }
  const view = cardView(state, diagram);
  assert.equal(view.state, "failed");
  assert.ok(view.fallbackText);
  assert.equal(view.canRetry, false);
  assert.equal(view.label, "");
  assert.equal(retryCard(state, diagram.id), state);
  assert.equal(cardDrawn(state, diagram.id), state);
});

test("duplicate reports within one draw attempt leave the retry budget alone", () => {
  const initial = emptyCardFailures({ cardIds: [diagram.id], retryLimit: 1 });
  const failed = failCard(initial, diagram, drawError);
  assert.equal(failCard(failed, diagram, drawError), failed);
  assert.equal(failCard(failed, diagram, new Error("Draw failed")), failed);
  assert.equal(cardView(failed, diagram).canRetry, true);

  const retryFailed = failCard(retryCard(failed, diagram.id), diagram, drawError);
  assert.equal(cardView(retryFailed, diagram).canRetry, false);
  assert.equal(failCard(retryFailed, diagram, drawError), retryFailed);
});

test("unknown card IDs leave the state alone", () => {
  const initial = emptyCardFailures({ cardIds: [diagram.id] });
  const unknown = { ...chart, id: "__proto__" };
  assert.equal(failCard(initial, unknown, drawError), initial);
  assert.equal(retryCard(initial, unknown.id), initial);
  assert.equal(cardDrawn(initial, unknown.id), initial);
  assert.equal(retryCard(initial, diagram.id), initial);
  const empty = emptyCardFailures();
  assert.equal(failCard(empty, diagram, drawError), empty);
});

test("a fallback leaves out error text, stack, paths, and source", () => {
  const source = "flowchart TD; A --> B";
  const path = "/example/render.ts";
  const error = new Error(`Parser rejected ${source}`);
  error.stack = `Error: ${error.message}\n    at render (${path}:4:2)`;
  const card = { ...diagram, body: source, src: path };
  const failed = failCard(emptyCardFailures({ cardIds: [card.id] }), card, error);
  const text = cardView(failed, card).fallbackText;
  for (const value of [error.message, "at render", source, path]) assert.ok(!text.includes(value));
  assert.equal(text.split("\n").length, 1);

  const untitled = { id: card.id, kind: card.kind };
  for (const title of [path, source, "<main>Example HTML</main>", error.stack, "at render (render.ts:4:2)"]) {
    assert.equal(cardView(failed, { ...card, title }).fallbackText, cardView(failed, untitled).fallbackText);
  }
});

test("a fallback drops a token-shaped title and preserves a whole Hebrew title", () => {
  const image = { id: "preview", kind: "image" } as const;
  const failed = failCard(emptyCardFailures({ cardIds: [image.id] }), image, drawError);
  const syntheticToken = "sk-" + "a".repeat(40);
  assert.equal(cardView(failed, { ...image, title: `Preview ${syntheticToken}` }).fallbackText,
    cardView(failed, image).fallbackText);

  const title = "שָׁלוֹם — תצוגה מקדימה";
  assert.ok(cardView(failed, { ...image, title }).fallbackText.includes(title));
});

test("each transition leaves its input state and sibling state intact", () => {
  const initial = Object.freeze(emptyCardFailures({ cardIds: [diagram.id, chart.id] }));
  const failed = Object.freeze(failCard(initial, diagram, drawError));
  const bothFailed = Object.freeze(failCard(failed, chart, drawError));
  const retrying = Object.freeze(retryCard(bothFailed, diagram.id));
  const recovered = cardDrawn(retrying, diagram.id);

  assert.equal(cardView(initial, diagram).state, "ok");
  assert.equal(cardView(failed, chart).state, "ok");
  assert.equal(cardView(bothFailed, diagram).state, "failed");
  assert.equal(cardView(retrying, diagram).state, "retrying");
  assert.equal(cardView(recovered, diagram).state, "ok");
  assert.deepEqual(cardView(recovered, chart), cardView(bothFailed, chart));
});
