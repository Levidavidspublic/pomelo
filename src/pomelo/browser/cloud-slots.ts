import { isFinal, type JobState } from "./job-state.js";

export interface CloudSlotJob {
  id: string;
  profileId: string;
  state: JobState;
  queuedAt: number;
  threadId: string;
  runner?: "cloud" | "pc";
}

export interface CloudSlotOptions {
  /** Invalid server limits default to one. */
  maxRunning: number;
  /** A positive integer is required to make scheduling decisions. */
  maxPerThread: number;
}

export type CloudSlotWaitReason = "server-full" | "thread-full" | "profile-busy";

export interface CloudSlotResult {
  start: string[];
  wait: { id: string; reason: CloudSlotWaitReason }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSlotLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** Allocate cloud slots from a job snapshot. Report the server, thread, then profile limit when they overlap. */
export function pickCloudSlots(jobs: unknown, opts: unknown): CloudSlotResult {
  const empty: CloudSlotResult = { start: [], wait: [] };
  try {
    if (!Array.isArray(jobs) || !isRecord(opts)) return empty;
    const { maxRunning, maxPerThread } = opts;
    if (!isSlotLimit(maxPerThread)) return empty;
    const serverLimit = isSlotLimit(maxRunning) ? maxRunning : 1;

    const seenIds = new Set<string>();
    const busyProfiles = new Set<string>();
    const runningByThread = new Map<string, number>();
    const queued: Pick<CloudSlotJob, "id" | "profileId" | "queuedAt" | "threadId">[] = [];
    let running = 0;
    for (const job of jobs) {
      if (!isRecord(job)) return empty;
      const { runner } = job;
      if (runner === "pc") continue;
      if (runner !== undefined && runner !== "cloud") return empty;

      const { id, profileId, state, queuedAt, threadId } = job;
      if (typeof id !== "string" || seenIds.has(id) || typeof profileId !== "string" || typeof threadId !== "string"
        || typeof queuedAt !== "number" || !Number.isFinite(queuedAt)) return empty;
      seenIds.add(id);

      if (state === "queued") {
        queued.push({ id, profileId, queuedAt, threadId });
      } else if (state === "running") {
        running++;
        busyProfiles.add(profileId);
        runningByThread.set(threadId, (runningByThread.get(threadId) ?? 0) + 1);
      } else if (state !== "waiting" && !isFinal(state)) {
        return empty;
      }
    }

    queued.sort((a, b) => a.queuedAt - b.queuedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const result: CloudSlotResult = { start: [], wait: [] };
    for (const { id, profileId, threadId } of queued) {
      const threadRunning = runningByThread.get(threadId) ?? 0;
      if (running >= serverLimit) {
        result.wait.push({ id, reason: "server-full" });
      } else if (threadRunning >= maxPerThread) {
        result.wait.push({ id, reason: "thread-full" });
      } else if (busyProfiles.has(profileId)) {
        result.wait.push({ id, reason: "profile-busy" });
      } else {
        result.start.push(id);
        running++;
        busyProfiles.add(profileId);
        runningByThread.set(threadId, threadRunning + 1);
      }
    }
    return result;
  } catch {
    // Reading malformed input can throw, for example when a property has a throwing getter.
    return empty;
  }
}
