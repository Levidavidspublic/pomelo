import type { CardKind } from "../../pomelo/card-id.js";
import { HIDDEN, hideSecrets } from "../../secrets.js";

export type FailureCard = {
  readonly id: string;
  readonly kind: CardKind;
  readonly title?: string;
};

type CardDraw = {
  readonly state: "ok" | "failed" | "retrying";
  readonly retries: number;
};

export type CardFailures = {
  readonly cards: ReadonlyMap<string, CardDraw>;
  readonly retryLimit: number;
};

export type CardFailureView = {
  state: CardDraw["state"];
  fallbackText: string;
  canRetry: boolean;
  label: string;
};

const DEFAULT_RETRY_LIMIT = 2;
const OK: CardDraw = Object.freeze({ state: "ok", retries: 0 });

/** Start a reply with its known card IDs and a retry budget for each card. */
export function emptyCardFailures({ cardIds = [], retryLimit = DEFAULT_RETRY_LIMIT }: {
  cardIds?: Iterable<string>;
  retryLimit?: number;
} = {}): CardFailures {
  const cards = new Map<string, CardDraw>();
  for (const id of cardIds) cards.set(id, OK);
  return { cards, retryLimit: Number.isSafeInteger(retryLimit) && retryLimit >= 0 ? retryLimit : DEFAULT_RETRY_LIMIT };
}

function withDraw(state: CardFailures, cardId: string, draw: CardDraw): CardFailures {
  const cards = new Map(state.cards);
  cards.set(cardId, draw);
  return { ...state, cards };
}

export function failCard(state: CardFailures, card: FailureCard, _error: unknown): CardFailures {
  const draw = state.cards.get(card.id);
  // Reports from the same attempt are idempotent. Error contents never enter the model.
  if (!draw || draw.state === "failed") return state;
  return withDraw(state, card.id, { ...draw, state: "failed" });
}

export function retryCard(state: CardFailures, cardId: string): CardFailures {
  const draw = state.cards.get(cardId);
  if (draw?.state !== "failed" || draw.retries >= state.retryLimit) return state;
  return withDraw(state, cardId, { state: "retrying", retries: draw.retries + 1 });
}

export function cardDrawn(state: CardFailures, cardId: string): CardFailures {
  if (state.cards.get(cardId)?.state !== "retrying") return state;
  return withDraw(state, cardId, OK);
}

function displayTitle(value: string | undefined): string {
  const title = value?.trim() ?? "";
  // Drop titles that look like paths, markup, code, or credentials.
  if (/[/\\<>{}=`\p{Cc}\p{Bidi_Control}\u2028\u2029]|^(?:~{3,}|at\s+\S+\s+\()/u.test(title)) return "";
  if (title.includes(HIDDEN) || hideSecrets(title).hidden || /[a-z\d_-]{32,}|\bbearer\s+\S{16,}/i.test(title)) return "";
  return title;
}

export function cardView(state: CardFailures, card: FailureCard): CardFailureView {
  const draw = state.cards.get(card.id) ?? OK;
  if (draw.state === "ok") return { state: "ok", fallbackText: "", canRetry: false, label: "" };

  const title = displayTitle(card.title);
  const canRetry = draw.state === "failed" && draw.retries < state.retryLimit;
  return {
    state: draw.state,
    fallbackText: `Couldn't display this ${card.kind}${title ? ` (${title})` : ""}.`,
    canRetry,
    label: canRetry ? "Try again" : "",
  };
}
