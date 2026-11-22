import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_REPLY_BODY_BYTES, MAX_REPLY_CARDS, THREAD_CARD_RATE_LIMIT } from "../src/pomelo/card-budget.js";
import { cardGate, type CardGateInput } from "../src/pomelo/card-gate.js";
import { assignCardIds } from "../src/pomelo/card-id.js";
import { cleanPomeloCard } from "../src/pomelo/rich-cards.js";
import { HIDDEN } from "../src/secrets.js";

const context = {
  threadId: "thread-1",
  messageId: "message-1",
  replyCards: [],
  threadCardTimestamps: [],
  now: 1_000_000,
} satisfies Omit<CardGateInput, "args">;

const chart = {
  kind: "chart",
  chart: "bar",
  title: "  Travel\n times  ",
  labels: [" Train ", "Bus"],
  series: [{ name: "Weekday", values: [18, 24] }],
  extra: true,
};
const widget = { kind: "widget", title: "View options", body: { type: "toggle", label: "Show details" } };
const chartMetadata = { kind: "chart", bytes: 100 } as const;
const fullReply = Array.from({ length: MAX_REPLY_CARDS }, () => chartMetadata);

function refuse(input: CardGateInput, reason: string | RegExp) {
  const result = cardGate(input);
  assert.equal(result.ok, false);
  if (typeof reason === "string") assert.equal(result.reason, reason);
  else assert.match(result.reason, reason);
  assert.match(result.fallbackText, /^[^\r\n\u0085\u2028\u2029]+$/);
  assert.ok(result.fallbackText.length < 240);
  return result.fallbackText;
}

test("returns a cleaned chart with the ID assigned by the reply ID rule", () => {
  const result = cardGate({ ...context, args: chart });
  const ids = assignCardIds(context.threadId, context.messageId, [{ kind: chart.kind }]);
  assert.ok(ids.ok);
  assert.deepEqual(result, {
    ok: true,
    card: {
      kind: "chart",
      chart: "bar",
      title: "Travel times",
      labels: ["Train", "Bus"],
      series: chart.series,
      id: ids.cards[0].id,
    },
  });
});

test("replaying the same reply snapshot gives the same ID", () => {
  const input = { ...context, args: chart };
  const first = cardGate(input);
  const replay = cardGate(input);
  assert.ok(first.ok);
  assert.ok(replay.ok);
  assert.equal(replay.card.id, first.card.id);
});

test("assigns a distinct ID to a second chart in the same reply", () => {
  const first = cardGate({ ...context, args: { ...chart, id: "travel-times" } });
  assert.ok(first.ok);
  assert.equal(first.card.id, "travel-times");
  const replyCards = [{ ...chartMetadata, id: first.card.id }];
  const second = cardGate({ ...context, replyCards, args: { ...chart, title: "Weekend trips", id: first.card.id } });
  assert.ok(second.ok);
  assert.notEqual(second.card.id, first.card.id);
});

test("uses a generated ID when a requested ID looks like a secret", () => {
  const id = ["sk", "fakefixture12345".repeat(2) + "00"].join("-");
  const expected = cardGate({ ...context, args: chart });
  assert.ok(expected.ok);
  assert.deepEqual(cardGate({ ...context, args: { ...chart, id } }), expected);
});

test("refuses an unknown kind with the cleaner's reason before checking the budget", () => {
  const args = { kind: "unknown", title: "  Travel\n times  " };
  const cleaned = cleanPomeloCard(args);
  assert.ok("error" in cleaned);
  const fallback = refuse({ ...context, args, replyCards: fullReply }, cleaned.error);
  assert.match(fallback, /Travel times/);
  assert.ok(fallback.includes(cleaned.error));
});

test("refuses a ninth card before assigning its ID", () => {
  const fallback = refuse({ ...context, args: chart, replyCards: fullReply, messageId: "" }, "reply-count");
  assert.match(fallback, /Travel times.*8-card limit/);
});

test("refuses a third widget", () => {
  const replyCards = [{ kind: "widget", bytes: 100 }, { kind: "widget", bytes: 100 }] as const;
  const fallback = refuse({ ...context, args: widget, replyCards }, "widget-count");
  assert.match(fallback, /View options.*2-widget limit/);
});

test("keeps the whole Hebrew title in the fallback for an invalid diagram", () => {
  const title = "תהליך אישור בקשות";
  const fallback = refuse({ ...context, args: { kind: "diagram", title } }, /Mermaid source/);
  assert.ok(fallback.includes(title));
});

test("masks a secret-shaped title on cleaner and budget refusals", () => {
  const canary = ["sk", "obviouslyfakecanary123".repeat(2)].join("-");
  const title = `Reference ${canary}`;
  const badCard = refuse({ ...context, args: { kind: "diagram", title } }, /Mermaid source/);
  const overBudget = refuse({ ...context, args: { ...chart, title }, replyCards: fullReply }, "reply-count");
  for (const fallback of [badCard, overBudget]) {
    assert.ok(fallback.includes(HIDDEN));
    assert.ok(!fallback.includes(canary.split("-")[1]));
  }
});

test("keeps HTML and Mermaid source out of the fallback", () => {
  for (const args of [
    { kind: "artifact", title: "Report", body: "<section>Quarterly report</section>" },
    { kind: "diagram", title: "Flow", body: "flowchart TD\n  Start --> Finish" },
  ]) {
    const budgetFallback = refuse({ ...context, args, replyCards: fullReply }, "reply-count");
    const cleanerFallback = refuse({ ...context, args: { ...args, version: 0 } }, /positive whole number/);
    for (const fallback of [budgetFallback, cleanerFallback]) {
      assert.ok(fallback.includes(args.title));
      for (const line of args.body.split("\n")) assert.ok(!fallback.includes(line.trim()));
    }
  }
});

test("uses the known card kind for a missing title and refuses non-object arguments", () => {
  const fallback = refuse({ ...context, args: { kind: "diagram" } }, /title/);
  assert.match(fallback, /diagram/);
  for (const args of [null, undefined, [], "not a card", 42]) {
    const cleaned = cleanPomeloCard(args);
    assert.ok("error" in cleaned);
    assert.match(refuse({ ...context, args }, cleaned.error), /card/i);
  }
  assert.match(refuse(null as unknown as CardGateInput, "bad-input"), /card/i);
});

test("uses UTF-8 body bytes and the caller's thread timestamps for the budget", () => {
  const args = { kind: "artifact", title: "Report", body: "é" };
  const replyCards = [{ kind: "image", bytes: MAX_REPLY_BODY_BYTES - 1 }] as const;
  assert.match(refuse({ ...context, args, replyCards }, "reply-bytes"), /512 KiB/);

  const threadCardTimestamps = Array.from({ length: THREAD_CARD_RATE_LIMIT.maxCards }, () => context.now);
  assert.match(refuse({ ...context, args, threadCardTimestamps }, "thread-rate"), /40-card limit/);
});

test("returns the ID rule's refusal with a plain-text fallback", () => {
  assert.match(refuse({ ...context, args: chart, threadId: "" }, /thread ID/), /Travel times/);
});
