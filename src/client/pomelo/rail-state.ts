export interface RailStateInput {
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  rowCount: number;
  lastGoodAt?: number;
  now: number;
}

export interface RailStateView {
  kind: "first-load" | "empty" | "ready" | "refreshing" | "stale" | "failed";
  showRows: boolean;
  note?: string;
  canRetry: boolean;
}

export const RAIL_NOTES = Object.freeze({
  empty: "No threads yet. Start one below.",
  failed: "Could not load threads.",
  stale: (timeLabel: string) => `Could not refresh. Showing threads from ${timeLabel}.`,
  earlier: "earlier",
  justNow: "just now",
  minutesAgo: (minutes: number) => `${minutes} min ago`,
  hoursAgo: (hours: number) => `${hours} h ago`,
});

function timeLabel(now: number, lastGoodAt?: number): string {
  if (lastGoodAt === undefined) return RAIL_NOTES.earlier;
  const age = now - lastGoodAt;
  if (!Number.isFinite(age) || age < 0) return RAIL_NOTES.earlier;
  if (age < 60_000) return RAIL_NOTES.justNow;
  if (age < 3_600_000) return RAIL_NOTES.minutesAgo(Math.floor(age / 60_000));
  return RAIL_NOTES.hoursAgo(Math.floor(age / 3_600_000));
}

export function railState({ loaded, loading, failed, rowCount, lastGoodAt, now }: RailStateInput): RailStateView {
  const hasRows = Number.isFinite(rowCount) && rowCount > 0;
  if (hasRows) {
    if (loading) return { kind: "refreshing", showRows: true, canRetry: false };
    if (failed) {
      return { kind: "stale", showRows: true, note: RAIL_NOTES.stale(timeLabel(now, lastGoodAt)), canRetry: true };
    }
    return { kind: "ready", showRows: true, canRetry: false };
  }
  if (failed && !loading) return { kind: "failed", showRows: false, note: RAIL_NOTES.failed, canRetry: true };
  if (loaded) return { kind: "empty", showRows: false, note: RAIL_NOTES.empty, canRetry: false };
  return { kind: "first-load", showRows: false, canRetry: false };
}
