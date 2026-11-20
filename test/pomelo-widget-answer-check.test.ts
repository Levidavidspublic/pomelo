import assert from "node:assert/strict";
import { test } from "node:test";
import type { PomeloCard } from "../src/pomelo/rich-cards.js";
import {
  checkWidgetAnswer,
  WIDGET_ANSWER_TEXT_CAP,
  type WidgetAnswerCard,
} from "../src/pomelo/widget-answer-check.js";

const card = {
  id: "card-1",
  threadId: "thread-1",
  kind: "widget",
  answered: false,
} as const;
const select = { ...card, body: { type: "select", options: ["Table", "רשימה"] } } as const;
const multiChoice = { ...card, body: { type: "multi-choice", options: select.body.options } } as const;
const number = { ...card, body: { type: "number", min: 0, max: 10 } } as const;
const shortText = { ...card, body: { type: "text" } } as const;
const answer = { cardId: card.id, threadId: card.threadId };

function check(widget: WidgetAnswerCard, value: unknown) {
  return checkWidgetAnswer([widget], { ...answer, value });
}

type RefuseReason = Extract<ReturnType<typeof checkWidgetAnswer>, { decision: "refuse" }>["reason"];

function expectRefusal(result: ReturnType<typeof checkWidgetAnswer>, reason: RefuseReason) {
  assert.equal(result.decision, "refuse");
  assert.equal(result.reason, reason);
  assert.ok(result.message.trim());
  return result.message;
}

test("accepts an offered choice after trimming and matches its case exactly", () => {
  assert.deepEqual(check(select, "  Table  "), { decision: "accept", cardId: card.id, value: "Table" });
  expectRefusal(check(select, "table"), "not-an-option");
  expectRefusal(check(select, "Chart"), "not-an-option");
  expectRefusal(check(select, ["Table"]), "not-an-option");
});

test("cleans every multi-choice selection and refuses the whole answer if any is invalid", () => {
  const value = Object.freeze(["  רשימה  ", "Table"]);
  assert.deepEqual(check(multiChoice, value), {
    decision: "accept", cardId: card.id, value: ["רשימה", "Table"],
  });
  expectRefusal(check(multiChoice, ["Table", "Chart"]), "not-an-option");
  expectRefusal(check(multiChoice, ["Table", null]), "not-an-option");
  expectRefusal(check(multiChoice, []), "empty");
});

test("accepts finite numbers within inclusive bounds", () => {
  for (const value of [0, 4.5, 10]) {
    assert.deepEqual(check(number, value), { decision: "accept", cardId: card.id, value });
  }
  for (const value of [-1, 11, NaN, Infinity, -Infinity, "5", null, true]) {
    expectRefusal(check(number, value), "out-of-range");
  }
});

test("accepts the existing rich-card widget shape with no numeric bounds", () => {
  const stored: Extract<PomeloCard, { kind: "widget" }> = {
    kind: "widget", title: "Amount", version: 1, body: { type: "number", label: "Amount" },
  };
  assert.deepEqual(check({ ...card, ...stored }, -7), {
    decision: "accept", cardId: card.id, value: -7,
  });
});

test("accepts both boolean toggle values", () => {
  const toggle = { ...card, body: { type: "toggle" } } as const;
  for (const value of [true, false]) {
    assert.deepEqual(check(toggle, value), { decision: "accept", cardId: card.id, value });
  }
  expectRefusal(check(toggle, "false"), "not-an-option");
});

test("trims short text and keeps Hebrew letters and marks intact", () => {
  const value = "שָׁלוֹם  עוֹלָם";
  assert.deepEqual(check(shortText, ` \t${value}\n `), { decision: "accept", cardId: card.id, value });
  expectRefusal(check(shortText, " \t\n "), "empty");
  expectRefusal(check(shortText, 12), "empty");
});

test("refuses text beyond the global or card-specific cap", () => {
  const value = "א".repeat(WIDGET_ANSWER_TEXT_CAP);
  assert.deepEqual(check(shortText, ` ${value} `), { decision: "accept", cardId: card.id, value });
  expectRefusal(check(shortText, `${value}ב`), "too-long");
  expectRefusal(check({ ...card, body: { type: "text", maxLength: 4 } }, "שלוםא"), "too-long");
  expectRefusal(check({ ...card, body: { type: "text", maxLength: value.length + 1 } }, `${value}ב`), "too-long");
});

test("checks card identity, thread and answered status before looking at the value", () => {
  const answeredCard = { ...select, answered: true };
  const wrongThread = { ...answer, threadId: "thread-2", value: "Chart" };
  expectRefusal(checkWidgetAnswer([answeredCard], { ...wrongThread, cardId: "missing" }), "unknown-card");
  expectRefusal(checkWidgetAnswer([answeredCard], wrongThread), "wrong-thread");
  expectRefusal(check(answeredCard, "Chart"), "already-answered");
  expectRefusal(check(answeredCard, "Table"), "already-answered");
});

test("refusal messages omit posted answer text", () => {
  const value = "sample-widget-answer-שָׁלוֹם";
  const longValue = value.repeat(WIDGET_ANSWER_TEXT_CAP);
  const messages = [
    expectRefusal(checkWidgetAnswer([], { ...answer, value }), "unknown-card"),
    expectRefusal(checkWidgetAnswer([shortText], { ...answer, threadId: "thread-2", value }), "wrong-thread"),
    expectRefusal(check({ ...shortText, answered: true }, value), "already-answered"),
    expectRefusal(check(select, value), "not-an-option"),
    expectRefusal(check(number, value), "out-of-range"),
    expectRefusal(check(shortText, longValue), "too-long"),
  ];
  for (const message of messages) assert.equal(message.includes(value), false);
});
