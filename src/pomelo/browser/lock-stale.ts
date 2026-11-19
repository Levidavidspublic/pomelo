import type { BrowserJobState } from "../browser-records.js";

export interface ProfileLock {
  profileId: string;
  jobId: string;
}

export interface LockJob {
  id: string;
  state: BrowserJobState;
  /** Milliseconds on the same clock as now. */
  lastHeartbeatAt?: number | null;
}

export interface LockCheckInput {
  lock?: ProfileLock | null;
  job?: LockJob | null;
  now: number;
  staleAfterMs: number;
}

export type LockCheckResult =
  | { verdict: "free"; reason: "no_lock" }
  | { verdict: "stale"; reason: "job_missing" | "job_ended" | "no_heartbeat" }
  | { verdict: "held"; reason: "heartbeat_fresh" | "waiting_for_amit" | "cannot_tell" };

/** Check a snapshot of a profile lock and its holder. */
export function checkLock({ lock, job, now, staleAfterMs }: LockCheckInput): LockCheckResult {
  if (!lock) return { verdict: "free", reason: "no_lock" };
  if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
    return { verdict: "held", reason: "cannot_tell" };
  }
  if (!job) return { verdict: "stale", reason: "job_missing" };
  if (job.id !== lock.jobId) return { verdict: "held", reason: "cannot_tell" };

  const { lastHeartbeatAt } = job;
  if (lastHeartbeatAt != null && (!Number.isFinite(lastHeartbeatAt) || !Number.isFinite(now) || lastHeartbeatAt > now)) {
    return { verdict: "held", reason: "cannot_tell" };
  }

  switch (job.state) {
    case "done":
    case "failed":
    case "cancelled":
      return { verdict: "stale", reason: "job_ended" };
    case "waiting":
      return { verdict: "held", reason: "waiting_for_amit" };
    case "running":
      if (lastHeartbeatAt == null) return { verdict: "held", reason: "cannot_tell" };
      if (now - lastHeartbeatAt > staleAfterMs) {
        return { verdict: "stale", reason: "no_heartbeat" };
      }
      return { verdict: "held", reason: "heartbeat_fresh" };
    default:
      return { verdict: "held", reason: "cannot_tell" };
  }
}
