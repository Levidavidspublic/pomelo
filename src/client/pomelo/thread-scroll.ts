const VERSION = 1;
const MAX_THREADS = 200;
const MAX_OFFSET_PX = 1_000_000;

export interface ScrollPosition {
  readonly anchorMessageId: string | null;
  readonly offsetPx: number;
  readonly atBottom: boolean;
}

interface ScrollEntry extends ScrollPosition {
  readonly sid: string;
  readonly usedAt: number;
}

export interface ScrollState {
  /** Oldest first. For equal counters or timestamps, the latest save comes last. */
  readonly entries: readonly ScrollEntry[];
}

export type ScrollRestore =
  | { mode: "top" }
  | { mode: "bottom" }
  | { mode: "anchor"; messageId: string; offsetPx: number };

export function emptyScrollState(): ScrollState {
  return { entries: [] };
}

function clampOffset(offsetPx: number): number {
  return Number.isFinite(offsetPx) ? Math.max(0, Math.min(offsetPx, MAX_OFFSET_PX)) : 0;
}

/** Without a caller-supplied counter or timestamp, recency follows save order. */
export function rememberScroll(
  state: ScrollState,
  sid: string,
  { anchorMessageId, offsetPx, atBottom }: ScrollPosition,
  usedAt = state.entries.at(-1)?.usedAt ?? 0,
): ScrollState {
  if (!sid || !Number.isFinite(usedAt)) return state;

  const entries = state.entries.filter((entry) => entry.sid !== sid);
  entries.push({ sid, usedAt, anchorMessageId: anchorMessageId || null, offsetPx: clampOffset(offsetPx), atBottom });
  entries.sort((a, b) => a.usedAt - b.usedAt);
  return { entries: entries.slice(-MAX_THREADS) };
}

export function restoreScroll(state: ScrollState, sid: string, messageIds: readonly string[]): ScrollRestore {
  if (messageIds.length === 0) return { mode: "top" };

  const entry = state.entries.find((entry) => entry.sid === sid);
  if (entry && !entry.atBottom && entry.anchorMessageId !== null && messageIds.includes(entry.anchorMessageId)) {
    return { mode: "anchor", messageId: entry.anchorMessageId, offsetPx: entry.offsetPx };
  }
  return { mode: "bottom" };
}

export function toJSON(state: ScrollState): string {
  const entries = state.entries.map(({ sid, usedAt, anchorMessageId, offsetPx, atBottom }) => ({
    sid, usedAt, anchorMessageId, offsetPx, atBottom,
  }));
  return JSON.stringify({ version: VERSION, entries });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function fromJSON(json: unknown): ScrollState {
  if (typeof json !== "string") return emptyScrollState();

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return emptyScrollState();
  }
  if (!isRecord(data) || data.version !== VERSION || !Array.isArray(data.entries) || data.entries.length > MAX_THREADS) {
    return emptyScrollState();
  }

  const entries: ScrollEntry[] = [];
  const seen = new Set<string>();
  for (const value of data.entries) {
    if (!isRecord(value)) return emptyScrollState();
    const { sid, usedAt, anchorMessageId, offsetPx, atBottom } = value;
    if (
      typeof sid !== "string" || !sid || seen.has(sid) ||
      typeof usedAt !== "number" || !Number.isFinite(usedAt) ||
      (anchorMessageId !== null && (typeof anchorMessageId !== "string" || !anchorMessageId)) ||
      typeof offsetPx !== "number" || typeof atBottom !== "boolean"
    ) return emptyScrollState();

    seen.add(sid);
    entries.push({ sid, usedAt, anchorMessageId, offsetPx: clampOffset(offsetPx), atBottom });
  }
  entries.sort((a, b) => a.usedAt - b.usedAt);
  return { entries };
}
