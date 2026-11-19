const LANE_STATUSES = ["running", "done", "failed", "cancelled"] as const;

export interface SpawnLane {
  id: string;
  spawnedBy: string;
  status: (typeof LANE_STATUSES)[number];
}

export interface SpawnLimits {
  maxRunning: number;
  maxDepth: number;
}

export interface SpawnInput {
  mainAgentId: string;
  callerId: string;
  lanes: readonly SpawnLane[];
  limits?: SpawnLimits;
}

export type SpawnDecision =
  | { ok: true }
  | { ok: false; reason: "too_many_running" | "too_deep" | "bad_input" };

// Extrapolated defaults for Pomelo sub-agents within one thread.
export const SPAWN_LIMITS: Readonly<SpawnLimits> = Object.freeze({ maxRunning: 4, maxDepth: 1 });

export function canSpawn({ mainAgentId, callerId, lanes, limits = SPAWN_LIMITS }: SpawnInput): SpawnDecision {
  if (typeof mainAgentId !== "string" || !mainAgentId || !Array.isArray(lanes) || !limits) {
    return { ok: false, reason: "bad_input" };
  }
  const { maxRunning, maxDepth } = limits;
  if (!Number.isInteger(maxRunning) || maxRunning < 0 || !Number.isInteger(maxDepth) || maxDepth < 0) {
    return { ok: false, reason: "bad_input" };
  }

  const ids = new Set([mainAgentId]);
  const childrenByParent = new Map<string, string[]>();
  let running = 0;
  for (const lane of lanes) {
    if (!lane || typeof lane.id !== "string" || !lane.id || ids.has(lane.id) || !LANE_STATUSES.includes(lane.status)) {
      return { ok: false, reason: "bad_input" };
    }
    ids.add(lane.id);
    const children = childrenByParent.get(lane.spawnedBy);
    if (children) children.push(lane.id);
    else childrenByParent.set(lane.spawnedBy, [lane.id]);
    if (lane.status === "running") running++;
  }

  // IDs are unique and each lane has one parent, so loops and missing parents are unreachable from the main agent.
  const pending = [{ id: mainAgentId, depth: 0 }];
  let reachable = 0;
  let callerDepth: number | undefined;
  while (pending.length > 0) {
    const { id, depth } = pending.pop()!;
    reachable++;
    if (id === callerId) callerDepth = depth;
    for (const child of childrenByParent.get(id) ?? []) {
      pending.push({ id: child, depth: depth + 1 });
    }
  }

  if (reachable !== ids.size || callerDepth === undefined) return { ok: false, reason: "bad_input" };
  if (running >= maxRunning) return { ok: false, reason: "too_many_running" };
  if (callerDepth + 1 > maxDepth) return { ok: false, reason: "too_deep" };
  return { ok: true };
}
