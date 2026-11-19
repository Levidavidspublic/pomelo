import { hideSecrets } from "../secrets.js";
import type { PomeloStore } from "./store.js";

export interface BrowserProfile {
  id: string;
  name: string;
  location: "local" | "cloud";
  cdpUrlName: string;
  importedFrom?: string;
  encryptedAtRest: true;
}

export type BrowserJobState = "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";

export interface BrowserJob {
  id: string;
  threadId: string;
  laneId: string;
  profileId: string;
  state: BrowserJobState;
  steps: string[];
  resourceLock: string | null;
}

type JobMove = { ok: true } | { ok: false; heldBy: string };

const PROFILE_PREFIX = "profile:";
const JOB_PREFIX = "job:";
const transitions: Record<BrowserJobState, readonly BrowserJobState[]> = {
  queued: ["running", "cancelled"],
  running: ["waiting", "done", "failed", "cancelled"],
  waiting: ["running", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: [],
};

function jobKey(id: string): string {
  // The store uses this suffix for the audit list beside each job record.
  if (id.endsWith(":events")) throw new Error("Browser job IDs cannot end with :events");
  return JOB_PREFIX + id;
}

async function writeRecord(store: PomeloStore, key: string, record: BrowserProfile | BrowserJob): Promise<void> {
  if (!await store.set(key, record)) throw new Error("Could not save browser record");
}

export async function saveProfile(store: PomeloStore, profile: BrowserProfile): Promise<void> {
  const { id, name, location, cdpUrlName, importedFrom, encryptedAtRest } = profile;
  if (typeof cdpUrlName !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(cdpUrlName)) {
    throw new Error("cdpUrlName must be an environment variable name");
  }
  await writeRecord(store, PROFILE_PREFIX + id, { id, name, location, cdpUrlName, importedFrom, encryptedAtRest });
}

export function getProfile(store: PomeloStore, id: string): Promise<BrowserProfile | null> {
  return store.get<BrowserProfile>(PROFILE_PREFIX + id);
}

export async function listProfiles(store: PomeloStore): Promise<BrowserProfile[]> {
  return (await store.list<BrowserProfile>(PROFILE_PREFIX)).map(({ value }) => value);
}

export async function createJob(
  store: PomeloStore, { id, threadId, laneId, profileId }: Pick<BrowserJob, "id" | "threadId" | "laneId" | "profileId">,
): Promise<BrowserJob> {
  const job: BrowserJob = { id, threadId, laneId, profileId, state: "queued", steps: [], resourceLock: null };
  if (!await store.set(jobKey(id), job, "ifMissing")) throw new Error("Browser job already exists");
  return job;
}

export function getJob(store: PomeloStore, id: string): Promise<BrowserJob | null> {
  return store.get<BrowserJob>(jobKey(id));
}

export async function listJobs(store: PomeloStore): Promise<BrowserJob[]> {
  return (await store.list<BrowserJob>(JOB_PREFIX)).map(({ value }) => value);
}

async function requireJob(store: PomeloStore, id: string): Promise<BrowserJob> {
  const job = await getJob(store, id);
  if (!job) throw new Error("Browser job does not exist");
  return job;
}

// The MVP store is single-process. Share the queue across wrappers so the lock check and
// write run together, and so appending a step cannot overwrite a concurrent state move.
let pendingMutation = Promise.resolve();

function mutateJob<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingMutation.then(operation);
  pendingMutation = result.then(() => {}, () => {});
  return result;
}

export function startJob(store: PomeloStore, jobId: string): Promise<JobMove> {
  return moveJob(store, jobId, "running");
}

export function moveJob(store: PomeloStore, jobId: string, next: BrowserJobState): Promise<JobMove> {
  return mutateJob(async () => {
    const job = await requireJob(store, jobId);
    if (!transitions[job.state].includes(next)) throw new Error(`Cannot move browser job from ${job.state} to ${next}`);

    if (job.state === "queued" && next === "running") {
      const owner = (await listJobs(store)).find((other) => other.resourceLock === job.profileId);
      if (owner) return { ok: false, heldBy: owner.id };
    }

    const resourceLock = next === "running" || next === "waiting" ? job.profileId : null;
    const key = jobKey(jobId);
    await writeRecord(store, key, { ...job, state: next, resourceLock });
    await store.appendLog(key, { from: job.state, to: next });
    return { ok: true };
  });
}

/** Appends a step that has already passed through the browser mask. */
export function appendStep(store: PomeloStore, jobId: string, step: string): Promise<void> {
  return mutateJob(async () => {
    const job = await requireJob(store, jobId);
    await writeRecord(store, jobKey(jobId), { ...job, steps: [...job.steps, hideSecrets(step).text] });
  });
}
