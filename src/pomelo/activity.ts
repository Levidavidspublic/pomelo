const activityEventKinds = ["message", "card", "approval", "subagent_result"] as const;
export type ActivityEventKind = (typeof activityEventKinds)[number];

const activityEvents: ReadonlySet<string> = new Set(activityEventKinds);

/** Advance thread activity using the event's Unix timestamp in milliseconds. */
export function bumpActivity<T extends object>(
  thread: T & { lastActivityAt?: number },
  event: { kind: string; ts: number },
): Omit<T, "lastActivityAt"> & { lastActivityAt?: number } {
  if (!activityEvents.has(event.kind) || !Number.isFinite(event.ts)) return thread;
  if (thread.lastActivityAt !== undefined && event.ts <= thread.lastActivityAt) return thread;
  return { ...thread, lastActivityAt: event.ts };
}

/** Check the opener and optional parent IDs on a thread record. */
export function checkThreadOrigin(thread: { id: string; openedBy?: unknown; parentThreadId?: unknown }): boolean {
  const { id, openedBy, parentThreadId } = thread;
  if (typeof openedBy !== "string" || openedBy.trim() === "") return false;
  return parentThreadId === undefined
    || (typeof parentThreadId === "string" && parentThreadId.trim() !== "" && parentThreadId !== id);
}
