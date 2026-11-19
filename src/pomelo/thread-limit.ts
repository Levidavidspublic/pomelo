export interface ThreadLimitRecord {
  openedBy: string;
  openedByAgent: boolean;
  parentThreadId?: string;
  openedAt: number;
  isOpen: boolean;
}

export interface ThreadLimits {
  windowMs: number;
  maxPerWindow: number;
  maxOpenChildren: number;
}

export interface ThreadLimitInput {
  mainAgentId: string;
  callerId: string;
  parentThreadId: string;
  now: number;
  threads: readonly ThreadLimitRecord[];
  limits?: ThreadLimits;
}

export type ThreadLimitDecision = { ok: true } | { ok: false; reason: string };

export const THREAD_LIMITS: Readonly<ThreadLimits> = Object.freeze({
  windowMs: 10 * 60_000,
  maxPerWindow: 5,
  maxOpenChildren: 20,
});

/** Check a snapshot of both recent opens and open children, using their original opening times. */
export function canOpenThread(input: ThreadLimitInput): ThreadLimitDecision {
  if (!input || typeof input.callerId !== "string" || !input.callerId.trim()) {
    return { ok: false, reason: "A caller ID is required to open a thread." };
  }

  const { mainAgentId, callerId, parentThreadId, now, threads, limits = THREAD_LIMITS } = input;
  if (typeof mainAgentId !== "string" || !mainAgentId.trim()) {
    return { ok: false, reason: "A main agent ID is required to open a thread." };
  }
  if (callerId !== mainAgentId) {
    return { ok: false, reason: "Ask the main agent to open the thread." };
  }
  if (!Number.isFinite(now)) {
    return { ok: false, reason: "The current time must be a finite number." };
  }
  if (!limits || ![limits.windowMs, limits.maxPerWindow, limits.maxOpenChildren]
    .every((value) => Number.isSafeInteger(value) && value > 0)) {
    return { ok: false, reason: "Thread limits must be positive whole numbers." };
  }
  if (typeof parentThreadId !== "string" || !parentThreadId.trim() || !Array.isArray(threads)) {
    return { ok: false, reason: "A parent thread ID and thread history are required." };
  }

  let recentOpens = 0;
  let openChildren = 0;
  for (const thread of threads) {
    if (!thread || typeof thread.openedByAgent !== "boolean") {
      return { ok: false, reason: "Thread history must identify agent-opened threads." };
    }
    if (!thread.openedByAgent) continue;
    if (!Number.isFinite(thread.openedAt)) {
      return { ok: false, reason: "Thread opening times must be finite numbers." };
    }
    if (typeof thread.openedBy !== "string" || !thread.openedBy.trim() || typeof thread.isOpen !== "boolean"
      || (thread.parentThreadId !== undefined && typeof thread.parentThreadId !== "string")) {
      return { ok: false, reason: "Agent-opened thread history is incomplete." };
    }

    const age = now - thread.openedAt;
    if (thread.openedBy === callerId && age >= 0 && age <= limits.windowMs) recentOpens++;
    if (thread.parentThreadId === parentThreadId && thread.isOpen) openChildren++;
  }

  if (openChildren >= limits.maxOpenChildren) {
    return { ok: false, reason: "This parent has too many open child threads. Try again after one closes." };
  }
  if (recentOpens >= limits.maxPerWindow) {
    return { ok: false, reason: "You have opened too many threads recently. Wait before opening another." };
  }
  return { ok: true };
}
