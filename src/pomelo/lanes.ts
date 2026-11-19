import type { PomeloStore } from "./store.js";

export interface SubagentLane {
  threadId: string;
  laneId: string;
  spawnedBy: string;
  purpose: string;
  status: "running" | "done" | "failed" | "cancelled";
  createdAt: number;
  endedAt?: number;
}

const PURPOSE_LIMIT = 120;

function lanePrefix(threadId: string): string {
  if (threadId.includes(":")) throw new Error("Thread id cannot contain a colon.");
  return `lane:${threadId}:`;
}

function laneKey(threadId: string, laneId: string): string {
  if (laneId.includes(":")) throw new Error("Lane id cannot contain a colon.");
  return lanePrefix(threadId) + laneId;
}

export async function createLane(
  store: PomeloStore,
  lane: Omit<SubagentLane, "status" | "endedAt">,
): Promise<void> {
  const { threadId, laneId, spawnedBy, createdAt } = lane;
  const key = laneKey(threadId, laneId);
  const purpose = lane.purpose.trim();
  if (!purpose || [...purpose].length > PURPOSE_LIMIT) {
    throw new Error(`Lane purpose must be between 1 and ${PURPOSE_LIMIT} characters.`);
  }

  const record: SubagentLane = { threadId, laneId, spawnedBy, purpose, status: "running", createdAt };
  if (!(await store.set(key, record, "ifMissing"))) throw new Error("Lane already exists.");
}

// Serialize status updates in the local process, including calls through different store wrappers.
const pendingUpdates = new Map<string, Promise<void>>();

export async function setLaneStatus(
  store: PomeloStore,
  threadId: string,
  laneId: string,
  status: SubagentLane["status"],
  at: number,
): Promise<void> {
  const key = laneKey(threadId, laneId);
  if (status !== "done" && status !== "failed" && status !== "cancelled") {
    throw new Error("Lane status must move to done, failed or cancelled.");
  }

  const update = (pendingUpdates.get(key) ?? Promise.resolve()).then(async () => {
    const lane = await store.get<SubagentLane>(key);
    if (!lane) throw new Error("Lane does not exist.");
    if (lane.status !== "running") throw new Error("A finished lane cannot change status.");
    if (!(await store.set(key, { ...lane, status, endedAt: at }))) {
      throw new Error("Could not save lane status.");
    }
  });
  // A rejected update still releases the next one.
  const settled = update.catch(() => {});
  pendingUpdates.set(key, settled);
  try {
    await update;
  } finally {
    if (pendingUpdates.get(key) === settled) pendingUpdates.delete(key);
  }
}

export async function listLanes(store: PomeloStore, threadId: string): Promise<SubagentLane[]> {
  return (await store.list<SubagentLane>(lanePrefix(threadId))).map(({ value }) => value);
}

export async function runningCount(store: PomeloStore, threadId: string): Promise<number> {
  return (await listLanes(store, threadId)).filter(({ status }) => status === "running").length;
}
