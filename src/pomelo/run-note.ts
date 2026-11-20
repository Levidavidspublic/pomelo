export type RunNoteState = "new" | "running" | "pr_open" | "done" | "stuck" | "held";

export interface RunNoteTicket {
  readonly number: number;
  readonly key: string;
  readonly title: string;
  /** Keep unrecognized state strings so the note can count them as unknown. */
  readonly state: string;
  readonly needsAmit: boolean;
}

export interface RunNoteFacts {
  readonly pauseFilePresent: boolean;
  readonly uncappedPaidTool: boolean;
}

export type RunNoteCounts = Record<RunNoteState | "unknown", number>;
export type RunNoteVerdict = (typeof RUN_NOTE_WORDING)["paused" | "blocked" | "needsYou" | "allClear"];

export interface RunNote {
  verdict: RunNoteVerdict;
  counts: RunNoteCounts;
  needsYou: string[];
  moreNeedsYou: number;
  nextAction: string;
}

export const RUN_NOTE_WORDING = Object.freeze({
  paused: "paused",
  blocked: "blocked",
  needsYou: "needs you",
  allClear: "all clear",
  pauseAction: "Remove the pause file when you are ready to resume.",
  blockedAction: "Cap or switch off uncapped paid tools.",
  inputAction: (number: number) => `Give your input on ticket #${number} first.`,
  reviewAction: (number: number) => `Review ticket #${number} first.`,
  clearAction: "No action needed.",
  ticketLine: (number: number, title: string, held: boolean) =>
    `#${number} ${title} (${held ? "held for you" : "stuck"})`,
  untitled: "Untitled ticket",
  ellipsis: "…",
});

const MAX_TICKET_LINES = 5;
const MAX_TITLE_LENGTH = 80;

function cleanTitle(raw: string): string {
  const title = raw.replace(/[\s\u0085]/gu, " ").replace(/[\p{Cc}\p{Bidi_Control}]/gu, "").replace(/ +/g, " ").trim();
  if (!title) return RUN_NOTE_WORDING.untitled;
  if (title.length <= MAX_TITLE_LENGTH) return title;

  // Cutting at a space preserves whole words, including Hebrew combining marks.
  const { ellipsis } = RUN_NOTE_WORDING;
  const end = title.lastIndexOf(" ", MAX_TITLE_LENGTH - ellipsis.length);
  return (end < 0 ? "" : title.slice(0, end)) + ellipsis;
}

export function runNote(tickets: readonly RunNoteTicket[], facts: RunNoteFacts): RunNote {
  const counts: RunNoteCounts = { new: 0, running: 0, pr_open: 0, done: 0, stuck: 0, held: 0, unknown: 0 };
  for (const { state } of tickets) {
    const bucket = Object.hasOwn(counts, state) ? state as keyof RunNoteCounts : "unknown";
    counts[bucket]++;
  }

  const attention = tickets.filter(({ state }) => state === "stuck" || state === "held");
  attention.sort((a, b) => a.number - b.number);
  const needsYou = attention.slice(0, MAX_TICKET_LINES).map(({ number, title, state }) =>
    RUN_NOTE_WORDING.ticketLine(number, cleanTitle(title), state === "held"),
  );
  const moreNeedsYou = attention.length - needsYou.length;

  const wording = RUN_NOTE_WORDING;
  let verdict: RunNoteVerdict = wording.allClear;
  let nextAction: string = wording.clearAction;
  if (facts.pauseFilePresent) {
    verdict = wording.paused;
    nextAction = wording.pauseAction;
  } else if (facts.uncappedPaidTool) {
    verdict = wording.blocked;
    nextAction = wording.blockedAction;
  } else if (attention.length) {
    verdict = wording.needsYou;
    const awaitingInput = attention.find(({ needsAmit }) => needsAmit);
    nextAction = awaitingInput ? wording.inputAction(awaitingInput.number) : wording.reviewAction(attention[0].number);
  }

  return { verdict, counts, needsYou, moreNeedsYou, nextAction };
}
