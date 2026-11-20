export const SPAWN_REPEAT_WINDOW_MS = 120_000;

interface SpawnCall {
  parentThreadId: string;
  spawnedBy: string;
  purpose: string;
  now?: number;
}

interface RecentLane {
  threadId: string;
  laneId: string;
  spawnedBy: string;
  purpose: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  createdAt?: number;
}

interface SpawnRepeatOptions {
  windowMs?: number;
}

type SpawnRepeat = { repeat: false } | { repeat: true; laneId: string; reason: string };

function validTime(time: number | undefined): time is number {
  return typeof time === "number" && Number.isFinite(time) && time >= 0;
}

/** Match the newest active lane by its creation time, using the caller's timestamp. */
export function checkSpawnRepeat(
  call: SpawnCall,
  recentLanes: readonly RecentLane[],
  { windowMs = SPAWN_REPEAT_WINDOW_MS }: SpawnRepeatOptions = {},
): SpawnRepeat {
  const { now, parentThreadId, spawnedBy } = call;
  if (!validTime(now) || !validTime(windowMs)) return { repeat: false };

  const purpose = call.purpose.trim().toLowerCase();
  let newest: { laneId: string; createdAt: number } | undefined;

  for (const lane of recentLanes) {
    if (lane.threadId !== parentThreadId || lane.spawnedBy !== spawnedBy) continue;
    if (lane.status !== "queued" && lane.status !== "running") continue;

    const { createdAt, laneId } = lane;
    if (!validTime(createdAt)) continue;
    const age = now - createdAt;
    if (age < 0 || age > windowMs) continue;
    if (lane.purpose.trim().toLowerCase() !== purpose) continue;

    if (!newest || createdAt > newest.createdAt) newest = { laneId, createdAt };
  }

  if (!newest) return { repeat: false };
  return { repeat: true, laneId: newest.laneId, reason: "A matching sub-agent lane is already queued or running." };
}
