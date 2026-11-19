import type { PomeloStore } from "./store.js";

export interface ThreadRecord {
  sid: string;
  projectTags: string[];
  lastActivityAt: number;
  openedBy: string;
  parentThreadId?: string;
}

const THREAD_PREFIX = "thread:";
const pendingWrites = new Map<string, Promise<void>>();

function validSid(sid: string): boolean {
  return typeof sid === "string" && sid.length > 0 && !sid.includes(":");
}

export function threadKey(sid: string): string {
  if (!validSid(sid)) throw new TypeError("Thread id must be nonempty and contain no colons");
  return THREAD_PREFIX + sid;
}

function isThreadRecord(value: unknown, sid: string): value is ThreadRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<Record<keyof ThreadRecord, unknown>>;
  return record.sid === sid
    && Array.isArray(record.projectTags)
    && record.projectTags.every((tag) => typeof tag === "string")
    && typeof record.lastActivityAt === "number"
    && Number.isFinite(record.lastActivityAt)
    && typeof record.openedBy === "string"
    && (record.parentThreadId === undefined || typeof record.parentThreadId === "string");
}

async function writeInOrder(key: string, write: () => Promise<void>): Promise<void> {
  // Store handles can share a backing store. Serialize the read-modify-write by key in this process.
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.then(write, write);
  pendingWrites.set(key, next);
  try {
    await next;
  } finally {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  }
}

async function writeRecord(store: PomeloStore, key: string, record: ThreadRecord): Promise<void> {
  if (!isThreadRecord(record, key.slice(THREAD_PREFIX.length))) throw new TypeError("Invalid thread metadata");
  await store.set(key, record);
}

export async function saveThreadMeta(store: PomeloStore, record: ThreadRecord): Promise<void> {
  const key = threadKey(record.sid);
  await writeInOrder(key, () => writeRecord(store, key, record));
}

export async function getThreadMeta(store: PomeloStore, sid: string): Promise<ThreadRecord | null> {
  const key = threadKey(sid);
  try {
    const value = await store.get(key);
    return isThreadRecord(value, sid) ? value : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function newThreadMeta(sid: string, at: number): ThreadRecord {
  // Existing Friday sessions may have no known opener in Pomelo.
  return { sid, projectTags: [], lastActivityAt: at, openedBy: "" };
}

export async function addProjectTags(
  store: PomeloStore, sid: string, slugs: readonly string[], now: number,
): Promise<void> {
  const key = threadKey(sid);
  await writeInOrder(key, async () => {
    const record = await getThreadMeta(store, sid) ?? newThreadMeta(sid, now);
    await writeRecord(store, key, {
      ...record,
      projectTags: [...new Set([...record.projectTags, ...slugs])],
      lastActivityAt: Math.max(record.lastActivityAt, now),
    });
  });
}

export async function touchThread(store: PomeloStore, sid: string, at: number): Promise<void> {
  const key = threadKey(sid);
  await writeInOrder(key, async () => {
    const record = await getThreadMeta(store, sid);
    if (record && at <= record.lastActivityAt) return;
    await writeRecord(store, key, record ? { ...record, lastActivityAt: at } : newThreadMeta(sid, at));
  });
}

export async function threadMetaMap(store: PomeloStore): Promise<Record<string, ThreadRecord>> {
  try {
    const records: [string, ThreadRecord][] = [];
    for (const { key, value } of await store.list(THREAD_PREFIX)) {
      const sid = key.slice(THREAD_PREFIX.length);
      if (validSid(sid) && isThreadRecord(value, sid)) records.push([sid, value]);
    }
    return Object.fromEntries(records);
  } catch (error) {
    // The store parses the whole list before returning any entries.
    if (error instanceof SyntaxError) return {};
    throw error;
  }
}
