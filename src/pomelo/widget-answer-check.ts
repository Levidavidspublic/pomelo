export const WIDGET_ANSWER_TEXT_CAP = 2000;

type WidgetBody =
  | { type: "select" | "multi-choice"; options: readonly string[] }
  | { type: "number"; min?: number; max?: number }
  | { type: "text"; maxLength?: number }
  | { type: "toggle" };

export type WidgetAnswerCard = {
  id: string;
  threadId: string;
  kind: "widget";
  body: WidgetBody;
  answered: boolean;
};

export type WidgetAnswerPost = { cardId: string; threadId: string; value: unknown };

type AnswerValue = string | string[] | number | boolean;

const refusalMessages = {
  "unknown-card": "This widget card is no longer available.",
  "wrong-thread": "This widget card belongs to another thread.",
  "already-answered": "This widget card has already been answered.",
  "not-an-option": "Choose from the options offered by the widget.",
  "out-of-range": "Enter a finite number within the allowed range.",
  "too-long": "Shorten the answer to fit the widget's text limit.",
  empty: "Enter an answer before submitting.",
};

type RefusalReason = keyof typeof refusalMessages;
type Refusal = { decision: "refuse"; reason: RefusalReason; message: string };
type WidgetAnswerDecision = { decision: "accept"; cardId: string; value: AnswerValue } | Refusal;

function refuse(reason: RefusalReason): Refusal {
  return { decision: "refuse", reason, message: refusalMessages[reason] };
}

function offeredOption(options: readonly string[], value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed && options.some((option) => option.trim() === trimmed)) return trimmed;
}

/** Check an answer against the server's current card state without changing that state. */
export function checkWidgetAnswer(cards: readonly WidgetAnswerCard[], answer: WidgetAnswerPost): WidgetAnswerDecision {
  const card = cards.find((entry) => entry.id === answer.cardId);
  if (!card) return refuse("unknown-card");
  if (card.threadId !== answer.threadId) return refuse("wrong-thread");
  if (card.answered) return refuse("already-answered");

  const { body, id: cardId } = card;
  const { value } = answer;
  switch (body.type) {
    case "select": {
      const option = offeredOption(body.options, value);
      if (option === undefined) return refuse("not-an-option");
      return { decision: "accept", cardId, value: option };
    }
    case "multi-choice": {
      if (!Array.isArray(value)) return refuse("not-an-option");
      if (!value.length) return refuse("empty");
      const options: string[] = [];
      for (const selection of value) {
        const option = offeredOption(body.options, selection);
        if (option === undefined) return refuse("not-an-option");
        options.push(option);
      }
      return { decision: "accept", cardId, value: options };
    }
    case "number": {
      const { min = -Infinity, max = Infinity } = body;
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        return refuse("out-of-range");
      }
      return { decision: "accept", cardId, value };
    }
    case "text": {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) return refuse("empty");
      const limit = Math.min(body.maxLength ?? WIDGET_ANSWER_TEXT_CAP, WIDGET_ANSWER_TEXT_CAP);
      if (text.length > limit) return refuse("too-long");
      return { decision: "accept", cardId, value: text };
    }
    case "toggle":
      if (typeof value !== "boolean") return refuse("not-an-option");
      return { decision: "accept", cardId, value };
  }
}
