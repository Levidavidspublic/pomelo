import type { BrowserJobState } from "../browser-records.js";
import { releasesLock } from "./job-state.js";
import type { ProfileLock } from "./lock-stale.js";

interface LockReleaseInput {
  job: Readonly<{ id: string; state: BrowserJobState; profileId: string }>;
  locks: readonly Readonly<ProfileLock>[];
}

type KeepReason = "conflict" | "other_job" | "queued_job" | "job_running" | "waiting_for_amit" | "unknown_state";

type LockFinding =
  | { kind: "conflict"; profileId: string }
  | (ProfileLock & { kind: "unexpected" });

interface LockReleaseResult {
  release: (ProfileLock & { reason: "job_ended" })[];
  keep: (ProfileLock & { reason: KeepReason })[];
  findings: LockFinding[];
}

/** Evaluate the lock snapshot. Ownership follows the job ID across all profiles. */
export function locksToRelease({ job, locks }: LockReleaseInput): LockReleaseResult {
  const profileCounts = new Map<string, number>();
  const findings: LockFinding[] = [];
  for (const { profileId } of locks) {
    const count = (profileCounts.get(profileId) ?? 0) + 1;
    profileCounts.set(profileId, count);
    if (count === 2) findings.push({ kind: "conflict", profileId });
  }

  const release: LockReleaseResult["release"] = [];
  const keep: LockReleaseResult["keep"] = [];
  const ended = releasesLock(job.state);
  for (const { profileId, jobId } of locks) {
    const owned = jobId === job.id;
    if (owned && job.state === "queued") findings.push({ kind: "unexpected", profileId, jobId });

    if ((profileCounts.get(profileId) ?? 0) > 1) {
      keep.push({ profileId, jobId, reason: "conflict" });
    } else if (!owned) {
      keep.push({ profileId, jobId, reason: "other_job" });
    } else if (ended) {
      release.push({ profileId, jobId, reason: "job_ended" });
    } else if (job.state === "running") {
      keep.push({ profileId, jobId, reason: "job_running" });
    } else if (job.state === "waiting") {
      keep.push({ profileId, jobId, reason: "waiting_for_amit" });
    } else if (job.state === "queued") {
      keep.push({ profileId, jobId, reason: "queued_job" });
    } else {
      keep.push({ profileId, jobId, reason: "unknown_state" });
    }
  }
  return { release, keep, findings };
}
