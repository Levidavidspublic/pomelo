import { hideSecretsIn } from "../secrets.js";
import { laneShownState } from "./lane-stall.js";
import { listLanes, type SubagentLane } from "./lanes.js";
import type { PomeloStore } from "./store.js";

const DEFAULT_LIMIT = 50;
const PURPOSE_LIMIT = 120;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

type LaneState = ReturnType<typeof laneShownState>["state"];
type LaneListRow = Pick<SubagentLane, "laneId" | "purpose" | "spawnedBy" | "status" | "createdAt" | "endedAt"> & {
  state: LaneState;
};

export interface LaneListOptions {
  limit?: number;
  quietLimitMs?: number;
  timingByLane?: ReadonlyMap<string, { lastStepAt?: number; askOpen?: boolean }>;
}

export interface LaneListReply {
  lanes: LaneListRow[];
  counts: { running: number; waiting: number; stuck: number };
  more: number;
}

function isLane(value: unknown): value is SubagentLane {
  if (!value || typeof value !== "object") return false;
  const lane = value as Partial<SubagentLane>;
  return typeof lane.threadId === "string"
    && typeof lane.laneId === "string" && lane.laneId.length > 0
    && typeof lane.purpose === "string"
    && typeof lane.spawnedBy === "string"
    && (lane.status === "running" || lane.status === "done" || lane.status === "failed" || lane.status === "cancelled")
    && Number.isFinite(lane.createdAt)
    && (lane.endedAt === undefined || Number.isFinite(lane.endedAt));
}

function shownPurpose(purpose: string): string {
  const safe = hideSecretsIn(purpose);
  let count = 0;
  for (const { index } of graphemes.segment(safe)) {
    if (count === PURPOSE_LIMIT) return safe.slice(0, index);
    count++;
  }
  return safe;
}

export function laneListReply(records: readonly unknown[], now: number, options: LaneListOptions = {}): LaneListReply {
  const { limit = DEFAULT_LIMIT, quietLimitMs, timingByLane } = options;
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : DEFAULT_LIMIT;
  const counts = { running: 0, waiting: 0, stuck: 0 };
  const active: LaneListRow[] = [];
  const finished: LaneListRow[] = [];
  const lanes = records.filter(isLane).sort((a, b) => a.createdAt - b.createdAt);

  for (const lane of lanes) {
    const { laneId, purpose, spawnedBy, status, createdAt, endedAt } = lane;
    const timing = timingByLane?.get(laneId);
    const { state } = laneShownState(lane, {
      now, quietLimitMs, lastStepAt: timing?.lastStepAt, askOpen: timing?.askOpen ?? false,
    });
    const row: LaneListRow = {
      laneId, purpose, spawnedBy, status, state, createdAt,
      ...(endedAt === undefined ? {} : { endedAt }),
    };
    if (state === "running" || state === "waiting" || state === "stuck") {
      counts[state]++;
      active.push(row);
    } else {
      finished.push(row);
    }
  }

  // Keep active lanes first, then fill the remaining slots with the newest finished lanes.
  const finishedSlots = Math.max(0, cap - active.length);
  const selected = [
    ...active.slice(0, cap),
    ...finished.slice(Math.max(0, finished.length - finishedSlots)),
  ].sort((a, b) => a.createdAt - b.createdAt);

  return {
    lanes: selected.map((row) => ({ ...row, purpose: shownPurpose(row.purpose) })),
    counts,
    more: lanes.length - selected.length,
  };
}

export async function loadLaneList(store: PomeloStore, threadId: string, now: number): Promise<LaneListReply> {
  return laneListReply(await listLanes(store, threadId), now);
}
