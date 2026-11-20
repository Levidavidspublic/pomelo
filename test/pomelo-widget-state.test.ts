import assert from "node:assert/strict";
import { test } from "node:test";
import { startWidget, widgetStep, widgetView, type WidgetEvent } from "../src/client/pomelo/widget-state.js";

const cardId = "card-1";
const pick = { type: "pick", cardId, pick: { value: "table", label: "Table" } } as const;
const send = { type: "send", cardId } as const;
const accepted = { type: "accepted", cardId } as const;
const refused = { type: "refused", cardId, reason: "Choose an available format." } as const;
const expired = { type: "expired", cardId } as const;
const reload = { type: "reload", cardId } as const;
const reloadAnswered = { ...reload, answer: { value: false } } as const;

test("labels all stages of answering and keeps the submitted pick", () => {
  const open = startWidget(cardId);
  assert.deepEqual(widgetView(open), { status: "open", label: "Open", canAnswer: true, busy: false });
  assert.strictEqual(widgetStep(open, send), open);
  assert.strictEqual(widgetStep(open, accepted), open);

  const picked = widgetStep(Object.freeze(open), pick);
  assert.deepEqual(widgetView(picked), { ...widgetView(open), pickedLabel: "Table" });

  const sending = widgetStep(Object.freeze(picked), send);
  assert.deepEqual(widgetView(sending), {
    status: "sending", label: "Sending", pickedLabel: "Table", canAnswer: false, busy: true,
  });
  assert.strictEqual(widgetStep(sending, send), sending);
  assert.strictEqual(widgetStep(sending, { ...pick, pick: { value: "List" } }), sending);

  const answered = widgetStep(Object.freeze(sending), accepted);
  assert.deepEqual(widgetView(answered), {
    status: "answered", label: "Answered", pickedLabel: "Table", canAnswer: false, busy: false,
  });
});

test("a refusal opens the card with the same pick and a reason, ready to retry", () => {
  const sending = widgetStep(widgetStep(startWidget(cardId), pick), send);
  const open = widgetStep(sending, refused);
  assert.deepEqual(widgetView(open), {
    status: "open", label: "Open", pickedLabel: "Table", reason: refused.reason, canAnswer: true, busy: false,
  });
  assert.strictEqual(widgetStep(open, refused), open);
  const retry = widgetStep(open, send);
  assert.deepEqual(widgetView(retry), widgetView(sending));
  assert.equal(widgetView(widgetStep(retry, accepted)).pickedLabel, "Table");
});

test("expiry closes an open card and waits for a reply on a sending card", () => {
  const picked = widgetStep(startWidget(cardId), pick);
  const closed = widgetStep(picked, expired);
  assert.deepEqual(widgetView(closed), { status: "closed", label: "Closed", canAnswer: false, busy: false });
  const sending = widgetStep(picked, send);
  const waiting = widgetStep(sending, expired);
  assert.strictEqual(waiting, sending);
  assert.equal(widgetView(widgetStep(waiting, accepted)).status, "answered");
  assert.equal(widgetView(widgetStep(waiting, refused)).status, "open");
});

test("reload restores the saved answer or opens a fresh card", () => {
  const picked = widgetStep(startWidget(cardId), pick);
  assert.deepEqual(widgetView(widgetStep(picked, reload)), widgetView(startWidget(cardId)));
  assert.deepEqual(widgetView(widgetStep(picked, reloadAnswered)), {
    status: "answered", label: "Answered", pickedLabel: "No", canAnswer: false, busy: false,
  });
  const zero = widgetStep(picked, { ...reload, answer: { value: 0 } });
  assert.equal(widgetView(zero).pickedLabel, "0");
});

const events: readonly WidgetEvent[] = [pick, send, accepted, refused, expired, reload, reloadAnswered];

test("answered and closed cards keep the same state for every later event", () => {
  const open = startWidget(cardId);
  const answered = widgetStep(widgetStep(widgetStep(open, pick), send), accepted);
  const closed = widgetStep(open, expired);
  for (const event of events) {
    assert.strictEqual(widgetStep(answered, event), answered);
    assert.strictEqual(widgetStep(closed, event), closed);
  }
});

test("events for another card keep the same state", () => {
  const open = widgetStep(startWidget(cardId), pick);
  const sending = widgetStep(open, send);
  for (const event of events) {
    const otherEvent = { ...event, cardId: "card-2" };
    assert.strictEqual(widgetStep(open, otherEvent), open);
    assert.strictEqual(widgetStep(sending, otherEvent), sending);
  }
});

test("picked labels preserve Hebrew and angle brackets as literal text", () => {
  for (const value of ["שָׁלוֹם", "Use <draft> & keep it"]) {
    const picked = widgetStep(startWidget(cardId), { type: "pick", cardId, pick: { value } });
    assert.equal(widgetView(picked).pickedLabel, value);
  }
});

test("long labels leave room for an ellipsis without splitting a grapheme", () => {
  const prefix = "a".repeat(78);
  for (const character of ["🌱", "שָׁ", "👩‍🌾"]) {
    const picked = widgetStep(startWidget(cardId), {
      type: "pick", cardId, pick: { value: prefix + character + "b".repeat(100) },
    });
    assert.equal(widgetView(picked).pickedLabel, prefix + "…");
  }
  const fits = prefix + "🌱";
  const picked = widgetStep(startWidget(cardId), { type: "pick", cardId, pick: { value: fits } });
  assert.equal(widgetView(picked).pickedLabel, fits);
});
