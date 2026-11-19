import assert from "node:assert/strict";
import { test } from "node:test";
import { cardArrival } from "../src/client/pomelo/card-arrival.js";

test("uses a general placeholder before the card kind arrives", () => {
  assert.deepEqual(cardArrival({ argsText: "", ended: false }), {
    state: "placeholder",
    label: "Card on its way",
  });
});

test("uses a chart placeholder until the stream ends", () => {
  for (const argsText of ['{"title":', '{"title":"Sales"}']) {
    assert.deepEqual(cardArrival({ kind: "chart", argsText, ended: false }), {
      state: "placeholder",
      label: "Chart on its way",
    });
  }
});

for (const kind of ["chart", "diagram", "artifact", "image", "widget"]) {
  test(`returns parsed arguments for a finished ${kind}`, () => {
    const args = { title: "תצוגה", details: { values: [1, 2] } };
    assert.deepEqual(cardArrival({ kind, argsText: JSON.stringify(args), ended: true }), {
      state: "ready",
      kind,
      args,
    });
  });
}

test("returns fixed fallback text for unfinished, empty or non-object JSON after the stream ends", () => {
  for (const argsText of ['{"title":"sample text"', "", " \n ", "[]", '"sample text"', "null", "42", "true"]) {
    assert.deepEqual(cardArrival({ kind: "chart", argsText, ended: true }), {
      state: "fallback",
      text: "Card data is invalid.",
    });
  }
});

test("uses fixed failure text even when the arguments parse", () => {
  const argsText = '{"title":"sample text"}';
  assert.deepEqual(cardArrival({ kind: "chart", argsText, ended: true, failed: true }), {
    state: "fallback",
    text: "Card could not load.",
  });
});

test("uses an unknown-card fallback for a finished unrecognized kind", () => {
  for (const kind of [undefined, "other", "constructor", "__proto__"]) {
    assert.deepEqual(cardArrival({ kind, argsText: "{}", ended: true }), {
      state: "fallback",
      text: "Unknown card type.",
    });
  }
});
