import { checkJobMove, isFinal } from "./job-state.js";

type JobChange = {
  jobId: string;
  status: "cancelled";
  endedAt: number;
  note?: "stopped mid-fill" | "stopped mid-import";
};

type JobStopResult = { changes: JobChange[]; reason?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Plan cancellations from a job snapshot. A mixed snapshot requires a request with a threadId. */
export function jobStop(jobs: unknown, request: unknown, now: number): JobStopResult {
  try {
    if (!isRecord(request)) return { changes: [], reason: "Invalid stop request." };
    const { kind, jobId, threadId } = request;
    if ((kind !== "job" && kind !== "thread") || (kind === "job" && !isId(jobId)) ||
        (threadId !== undefined && !isId(threadId))) {
      return { changes: [], reason: "Invalid stop request." };
    }
    if (!Number.isFinite(now)) return { changes: [], reason: "Invalid stop time." };

    const invalidJobs: JobStopResult = { changes: [], reason: "Invalid job list." };
    if (!Array.isArray(jobs)) return invalidJobs;

    const seenIds = new Set<string>();
    const changes: JobChange[] = [];
    let scopedThreadId = threadId;
    let reason = kind === "job" ? "Unknown job." : undefined;
    for (const job of jobs) {
      if (!isRecord(job)) return invalidJobs;
      const { id, threadId: jobThreadId, state, lastStepKind } = job;
      if (!isId(id) || !isId(jobThreadId) || seenIds.has(id) ||
          (lastStepKind != null && typeof lastStepKind !== "string")) return invalidJobs;
      seenIds.add(id);

      const finished = isFinal(state);
      if (!finished && !checkJobMove({ from: state, to: "cancelled", by: "amit" }).ok) return invalidJobs;

      scopedThreadId ??= jobThreadId;
      if (jobThreadId !== scopedThreadId) {
        if (threadId === undefined) return { changes: [], reason: "Specify a thread for jobs from multiple threads." };
        continue;
      }
      if (kind === "job" && id !== jobId) continue;
      if (finished) {
        if (kind === "job") reason = "Job already finished.";
        continue;
      }

      const change: JobChange = { jobId: id, status: "cancelled", endedAt: now };
      if (state === "running" || state === "waiting") {
        if (lastStepKind === "fill") change.note = "stopped mid-fill";
        if (lastStepKind === "import") change.note = "stopped mid-import";
      }
      changes.push(change);
      reason = undefined;
    }

    return reason === undefined ? { changes } : { changes, reason };
  } catch {
    return { changes: [], reason: "Invalid browser job stop input." };
  }
}
