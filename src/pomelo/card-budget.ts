export const MAX_REPLY_CARDS = 8;
export const MAX_REPLY_WIDGETS = 2;
export const MAX_REPLY_BODY_BYTES = 512 * 1024;
export const THREAD_CARD_RATE_LIMIT = Object.freeze({ maxCards: 40, windowMs: 10 * 60_000 });

const CARD_KINDS = ["diagram", "artifact", "image", "chart", "widget"] as const;

interface CardBudgetCard {
  readonly kind: (typeof CARD_KINDS)[number];
  readonly bytes: number;
}

interface CardBudgetInput {
  readonly replyCards: readonly CardBudgetCard[];
  readonly threadCardTimestamps: readonly number[];
  readonly newCard: CardBudgetCard;
  readonly now: number;
}

export type CardBudgetReason = "reply-count" | "widget-count" | "reply-bytes" | "thread-rate" | "bad-input";
type CardBudgetRefusal = { ok: false; reason: CardBudgetReason; message: string };

const MESSAGES: Record<CardBudgetReason, string> = {
  "reply-count": "This reply has reached its 8-card limit, so please continue in plain text.",
  "widget-count": "This reply has reached its 2-widget limit, so please continue in plain text.",
  "reply-bytes": "This card would put the reply over its 512 KiB limit, so please continue in plain text.",
  "thread-rate": "This thread has reached its 40-card limit for 10 minutes, so please continue in plain text.",
  "bad-input": "The card budget input is invalid, so please continue in plain text.",
};

function refuse(reason: CardBudgetReason): CardBudgetRefusal {
  return { ok: false, reason, message: MESSAGES[reason] };
}

function hasValidCardMetadata(card: CardBudgetCard): boolean {
  return !!card && CARD_KINDS.includes(card.kind) && Number.isInteger(card.bytes) && card.bytes >= 0;
}

/** Check whether a card fits using the caller's snapshot and millisecond timestamps. */
export function cardBudget(input: CardBudgetInput): { ok: true } | CardBudgetRefusal {
  if (!input) return refuse("bad-input");
  const { replyCards, threadCardTimestamps, newCard, now } = input;
  if (!Array.isArray(replyCards) || !Array.isArray(threadCardTimestamps)
    || !hasValidCardMetadata(newCard) || !Number.isFinite(now)) {
    return refuse("bad-input");
  }

  let replyBytes = newCard.bytes;
  let replyWidgets = newCard.kind === "widget" ? 1 : 0;
  for (const card of replyCards) {
    if (!hasValidCardMetadata(card)) return refuse("bad-input");
    replyBytes += card.bytes;
    if (card.kind === "widget") replyWidgets++;
  }

  let recentThreadCards = 0;
  for (const timestamp of threadCardTimestamps) {
    if (!Number.isFinite(timestamp)) return refuse("bad-input");
    const age = now - timestamp;
    if (age >= 0 && age <= THREAD_CARD_RATE_LIMIT.windowMs) recentThreadCards++;
  }

  if (replyCards.length >= MAX_REPLY_CARDS) return refuse("reply-count");
  if (replyWidgets > MAX_REPLY_WIDGETS) return refuse("widget-count");
  if (replyBytes > MAX_REPLY_BODY_BYTES) return refuse("reply-bytes");
  if (recentThreadCards >= THREAD_CARD_RATE_LIMIT.maxCards) return refuse("thread-rate");
  return { ok: true };
}
