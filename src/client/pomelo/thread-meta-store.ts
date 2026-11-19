import type { ThreadMeta } from "./rail-order.js";

type StoredThreadMeta = Readonly<ThreadMeta & {
  openedBy?: string;
  parentThreadId?: string;
}>;
type ThreadMetaSnapshot = Readonly<Record<string, StoredThreadMeta | undefined>>;

const emptySnapshot: ThreadMetaSnapshot = Object.freeze(Object.create(null));
let snapshot = emptySnapshot;
const listeners = new Set<() => void>();

function cleanTags(tags: unknown): readonly string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const clean = new Set<string>();
  for (const value of tags) {
    if (typeof value !== "string") continue;
    const tag = value.trim();
    if (tag) clean.add(tag);
    if (clean.size === 20) break;
  }
  return Object.freeze([...clean]);
}

function sameMeta(previous: StoredThreadMeta | undefined, next: StoredThreadMeta): boolean {
  if (!previous) return false;
  const tags = next.projectTags;
  const previousTags = previous.projectTags;
  return previous.lastActivityAt === next.lastActivityAt
    && previous.openedBy === next.openedBy
    && previous.parentThreadId === next.parentThreadId
    && previousTags?.length === tags?.length
    && (tags === undefined || tags.every((tag, index) => tag === previousTags?.[index]));
}

export function keepThreadMeta(rows: unknown): void {
  const next: Record<string, StoredThreadMeta> = Object.create(null);
  try {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row === null || typeof row !== "object") continue;
      const fields = row as Record<string, unknown>;
      const sid = fields.sid;
      if (typeof sid !== "string") continue;
      const { projectTags, lastActivityAt, openedBy, parentThreadId } = fields;
      const tags = cleanTags(projectTags);
      next[sid] = Object.freeze({
        ...(tags === undefined ? {} : { projectTags: tags }),
        ...(typeof lastActivityAt === "number" && Number.isFinite(lastActivityAt) ? { lastActivityAt } : {}),
        ...(typeof openedBy === "string" && openedBy.length > 0 ? { openedBy } : {}),
        ...(typeof parentThreadId === "string" && parentThreadId.length > 0 ? { parentThreadId } : {}),
      });
    }
  } catch {
    // Keep the previous snapshot if reading the reply fails partway through.
    return;
  }

  const ids = Object.keys(next);
  if (ids.length === Object.keys(snapshot).length && ids.every((sid) => sameMeta(snapshot[sid], next[sid]))) return;

  snapshot = Object.freeze(next);
  for (const listener of [...listeners]) {
    if (!listeners.has(listener)) continue;
    try {
      listener();
    } catch {
      // A subscriber cannot interrupt delivery to other listeners or App's session reload.
    }
  }
}

export function threadMetaSnapshot(): ThreadMetaSnapshot {
  return snapshot;
}

export function subscribeThreadMeta(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function resetThreadMetaForTest(): void {
  snapshot = emptySnapshot;
  listeners.clear();
}
