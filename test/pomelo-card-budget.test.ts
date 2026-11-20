import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cardBudget,
  MAX_REPLY_BODY_BYTES,
  MAX_REPLY_CARDS,
  MAX_REPLY_WIDGETS,
  THREAD_CARD_RATE_LIMIT,
  type CardBudgetReason,
} from "../src/pomelo/card-budget.js";

type BudgetInput = Parameters<typeof cardBudget>[0];

const now = 1_000_000;
const sampleBody = "Example card body";
const chart = { kind: "chart", bytes: 1, body: sampleBody } as const;
const widget = { kind: "widget", bytes: 1 } as const;
const input: BudgetInput = { now, replyCards: [], threadCardTimestamps: [], newCard: chart };

function assertRefused(input: unknown, reason: CardBudgetReason, message: RegExp): void {
  const decision = cardBudget(input as BudgetInput);
  assert.ok(decision.ok === false);
  assert.equal(decision.reason, reason);
  assert.match(decision.message, message);
  assert.match(decision.message, /continue in plain text\.$/);
  assert.ok(decision.message.length < 160);
  assert.ok(!decision.message.includes(sampleBody));
}

test("an empty reply accepts each kind of first card", () => {
  assert.equal(MAX_REPLY_CARDS, 8);
  assert.equal(MAX_REPLY_WIDGETS, 2);
  assert.equal(MAX_REPLY_BODY_BYTES, 512 * 1024);
  assert.deepEqual(THREAD_CARD_RATE_LIMIT, { maxCards: 40, windowMs: 600_000 });
  for (const kind of ["diagram", "artifact", "image", "chart", "widget"] as const) {
    assert.deepEqual(cardBudget({ ...input, newCard: { kind, bytes: 0 } }), { ok: true });
  }
});

test("a reply accepts its eighth card and refuses its ninth", () => {
  const replyCards = Array.from({ length: 8 }, () => chart);
  assert.deepEqual(cardBudget({ ...input, replyCards: replyCards.slice(1) }), { ok: true });
  assertRefused({ ...input, replyCards }, "reply-count", /8-card limit/);
});

test("a reply refuses a third widget and accepts a third chart", () => {
  assert.deepEqual(cardBudget({ ...input, replyCards: [widget], newCard: widget }), { ok: true });
  assertRefused({ ...input, replyCards: [widget, widget], newCard: widget }, "widget-count", /2-widget limit/);
  assert.deepEqual(cardBudget({ ...input, replyCards: [chart, chart] }), { ok: true });
  assert.deepEqual(cardBudget({ ...input, replyCards: [widget, widget] }), { ok: true });
});

test("card bodies can total exactly 512 KiB", () => {
  const replyCards = [
    { kind: "image", bytes: 384 * 1024 },
    { kind: "artifact", bytes: 128 * 1024 - 1 },
  ] as const;
  assert.deepEqual(cardBudget({ ...input, replyCards }), { ok: true });
  assertRefused({ ...input, replyCards, newCard: { ...chart, bytes: 2 } }, "reply-bytes", /512 KiB/);
});

test("a thread refuses the 41st card within ten minutes", () => {
  const recent = Array.from({ length: 39 }, () => now);
  const edge = now - 600_000;
  assertRefused({ ...input, threadCardTimestamps: [...recent, edge] }, "thread-rate", /40-card limit for 10 minutes/);
  for (const outsideWindow of [edge - 1, now + 1]) {
    assert.deepEqual(cardBudget({ ...input, threadCardTimestamps: [...recent, outsideWindow] }), { ok: true });
  }
});

test("limits are checked in reply, widget, byte, then thread order", () => {
  const first = {
    ...input,
    replyCards: [widget, widget, ...Array.from({ length: 6 }, () => chart)],
    threadCardTimestamps: Array.from({ length: 40 }, () => now),
    newCard: { ...widget, bytes: 512 * 1024 + 1 },
  };
  assertRefused(first, "reply-count", /8-card limit/);
  assertRefused({ ...first, replyCards: first.replyCards.slice(0, -1) }, "widget-count", /2-widget limit/);
  assertRefused({ ...first, replyCards: [widget] }, "reply-bytes", /512 KiB/);
});

test("malformed card metadata and times are refused before applying limits", () => {
  const rejectedCards = [
    { ...chart, kind: sampleBody },
    { ...chart, bytes: -1 },
    { ...chart, bytes: 0.5 },
    { ...chart, bytes: "1" },
    { ...chart, bytes: NaN },
    { ...chart, bytes: Infinity },
    null,
    {},
  ];
  for (const card of rejectedCards) {
    assertRefused({ ...input, newCard: card }, "bad-input", /invalid/);
    assertRefused({ ...input, replyCards: [...Array.from({ length: 8 }, () => chart), card] }, "bad-input", /invalid/);
  }
  for (const time of [NaN, Infinity, -Infinity, "1000000"]) {
    assertRefused({ ...input, now: time }, "bad-input", /invalid/);
    assertRefused({ ...input, threadCardTimestamps: [time] }, "bad-input", /invalid/);
  }
  for (const invalid of [null, {}, { ...input, replyCards: null }, { ...input, threadCardTimestamps: null }]) {
    assertRefused(invalid, "bad-input", /invalid/);
  }
});

test("the decision leaves the reply and thread histories intact", () => {
  const replyCards = Object.freeze([Object.freeze({ ...widget }), Object.freeze({ ...chart })]);
  const threadCardTimestamps = Object.freeze([now, now - 600_001, now - 1]);
  const snapshot = Object.freeze({ ...input, replyCards, threadCardTimestamps });
  assert.deepEqual(cardBudget(snapshot), { ok: true });
  assert.deepEqual(replyCards, [widget, chart]);
  assert.deepEqual(threadCardTimestamps, [now, now - 600_001, now - 1]);
});
