export interface RunLock {
  readonly runId: string;
  /** Time the run acquired the lock, in milliseconds. */
  readonly startedAt: number;
  /** Time of the last heartbeat, on the same clock as startedAt and nowMs. */
  readonly lastHeartbeatAt: number;
  readonly owner: string;
}

export interface RunLockOptions {
  /** Owner of a newly acquired lock. Defaults to the run ID. */
  readonly owner?: string;
  /** A positive, finite timeout in milliseconds. Defaults to five minutes. */
  readonly staleAfterMs?: number;
}

export type RunLockVerdict =
  | { verdict: "start"; reason: string; heldBy?: never; newLock: RunLock }
  | { verdict: "wait"; reason: string; heldBy?: string; newLock?: never }
  | { verdict: "take-over"; reason: string; heldBy: string; newLock: RunLock };

const DEFAULT_STALE_AFTER_MS = 5 * 60_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function ownValue(record: object, key: string): unknown {
  // A stored record has data fields. Reading the descriptor avoids invoking getters.
  try {
    return Object.getOwnPropertyDescriptor(record, key)?.value;
  } catch {
    return undefined;
  }
}

function readRunLock(lock: unknown): RunLock | undefined {
  if (typeof lock !== "object" || lock === null) return undefined;

  const runId = ownValue(lock, "runId");
  const startedAt = ownValue(lock, "startedAt");
  const lastHeartbeatAt = ownValue(lock, "lastHeartbeatAt");
  const owner = ownValue(lock, "owner");
  if (!isNonEmptyString(runId) || !isFiniteNumber(startedAt) || !isFiniteNumber(lastHeartbeatAt) || !isNonEmptyString(owner)) {
    return undefined;
  }
  return { runId, startedAt, lastHeartbeatAt, owner };
}

/** Check one lock snapshot. The caller must write newLock atomically against that snapshot before proceeding. */
export function checkRunLock(lock: unknown, runId: string, nowMs: number, opts: RunLockOptions = {}): RunLockVerdict {
  const current = readRunLock(lock);
  if (!isNonEmptyString(runId) || !isFiniteNumber(nowMs)) {
    return { verdict: "wait", reason: "A run ID and a finite current time are required.", heldBy: current?.runId };
  }

  if (current?.runId === runId) {
    return {
      verdict: "start",
      reason: "This run already holds the lock.",
      newLock: { ...current, lastHeartbeatAt: Math.max(current.lastHeartbeatAt, nowMs) },
    };
  }

  const timeout = ownValue(opts, "staleAfterMs");
  const staleAfterMs = isFiniteNumber(timeout) && timeout > 0 ? timeout : DEFAULT_STALE_AFTER_MS;
  if (current && nowMs - current.lastHeartbeatAt <= staleAfterMs) {
    return { verdict: "wait", reason: "Another run holds the lock.", heldBy: current.runId };
  }

  const owner = ownValue(opts, "owner");
  const newLock = { runId, startedAt: nowMs, lastHeartbeatAt: nowMs, owner: isNonEmptyString(owner) ? owner : runId };
  if (current) {
    return { verdict: "take-over", reason: "The run lock is stale.", heldBy: current.runId, newLock };
  }
  const reason = lock == null ? "There is no run lock." : "The run lock is unreadable.";
  return { verdict: "start", reason, newLock };
}
