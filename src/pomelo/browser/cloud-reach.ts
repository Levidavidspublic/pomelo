export interface CloudHeartbeat {
  /** Time in milliseconds on the same clock as `now`. */
  at: number;
  ok: boolean;
}

export interface CloudReachInput {
  beats: readonly CloudHeartbeat[];
  now: number;
  staleAfterMs: number;
  deadAfterMs: number;
}

export type CloudReachState = "reachable" | "slow" | "unreachable";

export type CloudReachResult =
  | { state: "reachable" | "slow"; lastOkAt: number; heldReason: null; retryAfterMs: null }
  | { state: "unreachable"; lastOkAt: number | null; heldReason: "vps-unreachable"; retryAfterMs: number };

const RETRY_DELAYS_MS = [5_000, 15_000, 60_000];

export function cloudReach({ beats, now, staleAfterMs, deadAfterMs }: CloudReachInput): CloudReachResult {
  const ordered = beats.filter(({ at }) => Number.isFinite(at) && at <= now);
  // A success ends the failure streak at its timestamp, even if a failure shares that time.
  ordered.sort((a, b) => b.at - a.at || Number(b.ok) - Number(a.ok));

  const lastOkIndex = ordered.findIndex(({ ok }) => ok);
  const lastOkAt = ordered[lastOkIndex]?.at ?? null;
  if (lastOkAt !== null) {
    const age = now - lastOkAt;
    if (age < deadAfterMs) {
      return { state: age < staleAfterMs ? "reachable" : "slow", lastOkAt, heldReason: null, retryAfterMs: null };
    }
  }

  const failures = lastOkIndex === -1 ? ordered.length : lastOkIndex;
  const delayIndex = Math.min(Math.max(failures - 1, 0), RETRY_DELAYS_MS.length - 1);
  return { state: "unreachable", lastOkAt, heldReason: "vps-unreachable", retryAfterMs: RETRY_DELAYS_MS[delayIndex] };
}
