export interface SeenState {
  readonly seenAt: Readonly<Record<string, number | undefined>>;
  /** The caller supplies the open session for the current view. */
  readonly activeSid?: string | null;
}

type ActivityTime = number | string | null | undefined;

const MAX_THREADS = 500;
const MAX_STORED_LENGTH = 128 * 1024;
const ISO_ACTIVITY = /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}(?:(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?)?$/;

function validSid(sid: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(sid) && sid !== "__proto__" && sid !== "constructor" && sid !== "prototype";
}

function validSeenEntry(entry: [string, unknown]): entry is [string, number] {
  const [sid, at] = entry;
  return validSid(sid) && typeof at === "number" && Number.isFinite(at);
}

function boundedSeenTimes(value: unknown): SeenState["seenAt"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const entries = Object.entries(value);
  if (!entries.every(validSeenEntry)) return {};
  if (entries.length > MAX_THREADS) entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_THREADS));
}

function activityMillis(value: ActivityTime): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const match = ISO_ACTIVITY.exec(value);
  if (!match) return NaN;

  // Interpret a datetime without an offset as UTC so the comparison is independent of the host time zone.
  return Date.parse(match[1] && !match[2] ? `${value}Z` : value);
}

export function markSeen(state: SeenState, threadId: string, now: number): SeenState {
  if (!validSid(threadId) || !Number.isFinite(now)) return { ...state };
  return { ...state, seenAt: boundedSeenTimes({ ...state.seenAt, [threadId]: now }) };
}

export function isUnread(state: SeenState, threadId: string, lastActivityAt: ActivityTime): boolean {
  if (state.activeSid === threadId) return false;
  const activityAt = activityMillis(lastActivityAt);
  if (!Number.isFinite(activityAt)) return false;
  const seenAt = Object.hasOwn(state.seenAt, threadId) ? state.seenAt[threadId] : undefined;
  return seenAt === undefined || activityAt > seenAt;
}

export function unreadCount(state: SeenState, rows: readonly { sid: string; lastActivityAt?: ActivityTime }[]): number {
  return rows.filter(({ sid, lastActivityAt }) => isUnread(state, sid, lastActivityAt)).length;
}

export function parseSeen(text: string | null | undefined): SeenState {
  if (typeof text !== "string" || text.length > MAX_STORED_LENGTH) return { seenAt: {} };
  try {
    return { seenAt: boundedSeenTimes(JSON.parse(text)) };
  } catch {
    return { seenAt: {} };
  }
}

export function serializeSeen(state: SeenState): string {
  return JSON.stringify(boundedSeenTimes(state.seenAt));
}
