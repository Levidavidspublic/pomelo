import { cardBudget } from "./card-budget.js";
import { assignCardIds, CARD_KINDS, type CardIdInput } from "./card-id.js";
import { cleanChartCard, type ChartCard } from "./chart-card.js";
import { maskText } from "./mask.js";
import { cleanPomeloCard, type PomeloCard } from "./rich-cards.js";

type CleanCard = PomeloCard | ChartCard;
type BudgetInput = Parameters<typeof cardBudget>[0];
type ReplyCard = BudgetInput["replyCards"][number] & Pick<CardIdInput, "id">;

export interface CardGateInput extends Pick<BudgetInput, "threadCardTimestamps" | "now"> {
  readonly threadId: string;
  readonly messageId: string;
  readonly args: unknown;
  /** Accepted cards in reply order, with their body byte counts and assigned IDs. */
  readonly replyCards: readonly ReplyCard[];
}

type CardGateRefusal = { ok: false; reason: string; fallbackText: string };
export type CardGateResult = { ok: true; card: CleanCard & { id: string } } | CardGateRefusal;

function refuse(reason: string, message: string, { title, kind }: { title?: unknown; kind?: unknown } = {}): CardGateRefusal {
  const cleanedTitle = typeof title === "string"
    ? maskText(title.replace(/[\s\u0085]+/g, " ").trim(), []).slice(0, 120).trimEnd()
    : "";
  const knownKind = CARD_KINDS.find((entry) => entry === kind);
  const kindLabel = knownKind ? `the ${knownKind} card` : "the card";
  const label = cleanedTitle ? `“${cleanedTitle}”` : kindLabel;
  return { ok: false, reason, fallbackText: `Could not show ${label}. ${message}` };
}

function bodyBytes(card: CleanCard): number {
  switch (card.kind) {
    case "image":
      return Buffer.byteLength(card.src);
    case "chart": {
      const { chart, labels, series, unit } = card;
      return Buffer.byteLength(JSON.stringify({ chart, labels, series, unit }));
    }
    case "widget":
      return Buffer.byteLength(JSON.stringify(card.body));
    default:
      return Buffer.byteLength(card.body);
  }
}

/** Decide whether a card can join the caller's reply snapshot. */
export function cardGate(input: CardGateInput): CardGateResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return refuse("bad-input", "The card request is invalid.");
  }
  const { args, threadId, messageId, replyCards, threadCardTimestamps, now } = input;
  const fields = args !== null && typeof args === "object" && !Array.isArray(args)
    ? args as Record<string, unknown>
    : undefined;
  const cleaned = fields?.kind === "chart" ? cleanChartCard(args) : cleanPomeloCard(args);
  if ("error" in cleaned) return refuse(cleaned.error, cleaned.error, fields);

  const { card } = cleaned;
  const budget = cardBudget({
    replyCards,
    threadCardTimestamps,
    now,
    newCard: { kind: card.kind, bytes: bodyBytes(card) },
  });
  if (!budget.ok) return refuse(budget.reason, budget.message, card);

  const requestedId = fields?.id;
  const id = typeof requestedId === "string" && maskText(requestedId, []) === requestedId ? requestedId : undefined;
  const assigned = assignCardIds(threadId, messageId, [...replyCards, { kind: card.kind, id }]);
  if (!assigned.ok) return refuse(assigned.reason, assigned.reason, card);

  return { ok: true, card: { ...card, id: assigned.cards[replyCards.length].id } };
}
