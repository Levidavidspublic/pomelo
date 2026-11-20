export interface ThreadPageRow {
  sid: string;
  lastActivityAt?: unknown;
}

export interface ThreadCursor {
  lastActivityAt: number | null;
  sid: string;
}

export interface ThreadPageOptions {
  limit?: number;
  cursor?: unknown;
}

export interface ThreadPage<Row extends ThreadPageRow> {
  rows: Row[];
  nextCursor: string | null;
  cursorRejected?: true;
}

const MAX_CURSOR_LENGTH = 2048;

function finiteActivity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function compare(a: ThreadCursor, b: ThreadCursor): number {
  if (a.lastActivityAt === b.lastActivityAt) {
    if (a.sid === b.sid) return 0;
    return a.sid < b.sid ? -1 : 1;
  }
  if (a.lastActivityAt === null) return 1;
  if (b.lastActivityAt === null) return -1;
  return b.lastActivityAt - a.lastActivityAt;
}

// The public FNV-1a checksum detects edits that leave the payload and checksum out of sync.
function checksum(payload: string): string {
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash = Math.imul(hash ^ payload.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16);
}

function encodeCursor({ lastActivityAt, sid }: ThreadCursor): string {
  const payload = encodeURIComponent(JSON.stringify([lastActivityAt, sid]));
  return `${payload}.${checksum(payload)}`;
}

export function parseThreadCursor(text: unknown): ThreadCursor | null {
  if (typeof text !== "string" || text.length > MAX_CURSOR_LENGTH) return null;
  const separator = text.lastIndexOf(".");
  if (separator < 1) return null;

  try {
    const value: unknown = JSON.parse(decodeURIComponent(text.slice(0, separator)));
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [lastActivityAt, sid] = value;
    if (lastActivityAt !== null && !finiteActivity(lastActivityAt)) return null;
    if (typeof sid !== "string" || sid.length === 0) return null;

    const cursor: ThreadCursor = { lastActivityAt, sid };
    return encodeCursor(cursor) === text ? cursor : null;
  } catch {
    return null;
  }
}

/**
 * Page session rows (one per sid) using the previous page's original sort key.
 * Refresh from page one to pick up activity that has moved an unseen thread above that key.
 */
export function pageThreads<Row extends ThreadPageRow>(rows: readonly Row[], opts: ThreadPageOptions = {}): ThreadPage<Row> {
  const requested = opts.limit ?? 30;
  const limit = Number.isNaN(requested) ? 30 : Math.min(100, Math.max(1, Math.trunc(requested)));
  const cursor = parseThreadCursor(opts.cursor);
  const ordered = rows.map((row) => {
    const { sid, lastActivityAt } = row;
    const key: ThreadCursor = { sid, lastActivityAt: finiteActivity(lastActivityAt) ? lastActivityAt : null };
    return { row, key };
  });
  // Activity can move a thread above the saved boundary. The current position of its sid cannot define the next page.
  const remaining = cursor ? ordered.filter(({ key }) => key.sid !== cursor.sid && compare(key, cursor) > 0) : ordered;
  remaining.sort((a, b) => compare(a.key, b.key));
  const page = {
    rows: remaining.slice(0, limit).map(({ row }) => row),
    nextCursor: remaining.length > limit ? encodeCursor(remaining[limit - 1].key) : null,
  };
  if (opts.cursor !== undefined && cursor === null) return { ...page, cursorRejected: true };
  return page;
}
