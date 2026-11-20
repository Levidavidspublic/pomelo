export const DEFAULT_IDLE_LIMIT_MS = 15 * 60_000;
export const DEFAULT_KEEP_OPEN_AT_MOST = 2;

export interface CloudIdleProfile {
  id: string;
  target: string;
  open: boolean;
  lastActiveAt?: number;
  runningJobs: number;
  waitingJobs: number;
  queuedJobs: number;
  liveGrants: number;
}

export interface CloudIdleInput {
  now: number;
  idleLimitMs?: number;
  keepOpenAtMost?: number;
  profiles: readonly CloudIdleProfile[];
}

export type CloudIdleDecision = { id: string } & (
  | {
    action: "keep";
    reason: "not-cloud" | "already-closed" | "job-running" | "job-waiting" | "job-queued" | "grant-live" | "clock-unsure" | "recent";
  }
  | { action: "close"; reason: "idle" | "over-limit" }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Recommends which browser processes can stop while preserving their profiles, locks and job history. */
export function pickIdleCloudProfiles(input: unknown): CloudIdleDecision[] {
  try {
    if (!isRecord(input)) return [];
    const { now, profiles, idleLimitMs = DEFAULT_IDLE_LIMIT_MS, keepOpenAtMost = DEFAULT_KEEP_OPEN_AT_MOST } = input;
    if (!isFiniteNumber(now) || !Array.isArray(profiles)) return [];
    if (!isFiniteNumber(idleLimitMs) || idleLimitMs < 0 || !isCount(keepOpenAtMost)) return [];

    const decisions: CloudIdleDecision[] = [];
    const recent: { id: string; lastActiveAt: number; index: number }[] = [];
    for (const profile of profiles) {
      if (!isRecord(profile)) continue;
      const { id, target, open, runningJobs, waitingJobs, queuedJobs, liveGrants, lastActiveAt } = profile;
      if (typeof id !== "string" || id.length === 0 || typeof target !== "string" || typeof open !== "boolean") continue;
      if (!isCount(runningJobs) || !isCount(waitingJobs) || !isCount(queuedJobs) || !isCount(liveGrants)) continue;

      let decision: CloudIdleDecision;
      if (target !== "cloud") decision = { id, action: "keep", reason: "not-cloud" };
      else if (!open) decision = { id, action: "keep", reason: "already-closed" };
      else if (runningJobs > 0) decision = { id, action: "keep", reason: "job-running" };
      else if (waitingJobs > 0) decision = { id, action: "keep", reason: "job-waiting" };
      else if (queuedJobs > 0) decision = { id, action: "keep", reason: "job-queued" };
      else if (liveGrants > 0) decision = { id, action: "keep", reason: "grant-live" };
      else if (!isFiniteNumber(lastActiveAt) || lastActiveAt > now) decision = { id, action: "keep", reason: "clock-unsure" };
      else if (now - lastActiveAt >= idleLimitMs) decision = { id, action: "close", reason: "idle" };
      else {
        recent.push({ id, lastActiveAt, index: decisions.length });
        decision = { id, action: "keep", reason: "recent" };
      }
      decisions.push(decision);
    }

    const excess = recent.length - keepOpenAtMost;
    if (excess > 0) {
      recent.sort((a, b) => {
        if (a.lastActiveAt !== b.lastActiveAt) return a.lastActiveAt - b.lastActiveAt;
        if (a.id < b.id) return -1;
        return a.id > b.id ? 1 : 0;
      });
      for (const { id, index } of recent.slice(0, excess)) {
        decisions[index] = { id, action: "close", reason: "over-limit" };
      }
    }
    return decisions;
  } catch {
    // Reading unknown input can throw, for example when a property is a getter.
    return [];
  }
}
