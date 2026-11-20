interface ThreadDraft {
  readonly text: string;
  readonly updatedAt: number;
}

export interface ThreadDraftState {
  readonly drafts: Readonly<Record<string, ThreadDraft>>;
}

const VERSION = 1;
const MAX_DRAFTS = 50;
const MAX_DRAFT_LENGTH = 20_000;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function validThreadId(threadId: string): boolean {
  return typeof threadId === "string" && threadId.length >= 1 && threadId.length <= 128
    && !/[^A-Za-z0-9_-]/.test(threadId)
    && threadId !== "__proto__" && threadId !== "constructor" && threadId !== "prototype";
}

function clipDraft(text: string): string {
  if (text.length <= MAX_DRAFT_LENGTH) return text;
  // Find the start of the grapheme containing the first code unit beyond the cap.
  const overflow = graphemes.segment(text).containing(MAX_DRAFT_LENGTH);
  return text.slice(0, overflow?.index);
}

function keepNewest(entries: [string, ThreadDraft][], limit: number): ThreadDraftState {
  if (entries.length > limit) entries.sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
  return { drafts: Object.fromEntries(entries.slice(0, limit)) };
}

export function setDraft(state: ThreadDraftState, threadId: string, text: string, updatedAt: number): ThreadDraftState {
  if (!validThreadId(threadId) || !Number.isFinite(updatedAt)) return { ...state };
  const clipped = clipDraft(text);
  if (!clipped.trim()) return clearDraft(state, threadId);
  const drafts = { ...state.drafts, [threadId]: { text: clipped, updatedAt } };
  return keepNewest(Object.entries(drafts), MAX_DRAFTS);
}

export function getDraft(state: ThreadDraftState, threadId: string): string {
  if (!validThreadId(threadId) || !Object.hasOwn(state.drafts, threadId)) return "";
  return state.drafts[threadId].text;
}

export function clearDraft(state: ThreadDraftState, threadId: string): ThreadDraftState {
  if (!validThreadId(threadId) || !Object.hasOwn(state.drafts, threadId)) return { ...state };
  const drafts = { ...state.drafts };
  delete drafts[threadId];
  return { drafts };
}

export function pruneDrafts(state: ThreadDraftState, liveThreadIds: Iterable<string>, limit = MAX_DRAFTS): ThreadDraftState {
  const live = new Set(liveThreadIds);
  const count = Number.isNaN(limit) ? MAX_DRAFTS : Math.max(0, Math.min(MAX_DRAFTS, Math.trunc(limit)));
  return keepNewest(Object.entries(state.drafts).filter(([threadId]) => live.has(threadId)), count);
}

export function toStored(state: ThreadDraftState): string {
  return JSON.stringify({ v: VERSION, drafts: state.drafts });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function fromStored(text: string | null | undefined): ThreadDraftState {
  const empty: ThreadDraftState = { drafts: {} };
  if (typeof text !== "string") return empty;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!isRecord(stored) || stored.v !== VERSION || !isRecord(stored.drafts)) return empty;

  const entries: [string, ThreadDraft][] = [];
  for (const [threadId, draft] of Object.entries(stored.drafts)) {
    if (!validThreadId(threadId) || !isRecord(draft)) return empty;
    const { text, updatedAt } = draft;
    if (typeof text !== "string" || typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return empty;
    const clipped = clipDraft(text);
    if (clipped.trim()) entries.push([threadId, { text: clipped, updatedAt }]);
  }
  return keepNewest(entries, MAX_DRAFTS);
}
