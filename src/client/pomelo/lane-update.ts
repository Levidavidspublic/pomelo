const STATUS_BY_EVENT = {
  "lane-started": "running",
  "lane-step": "running",
  "lane-waiting": "waiting",
  "lane-done": "done",
  "lane-failed": "failed",
  "lane-cancelled": "cancelled",
} as const;

export interface LaneEvent {
  type: keyof typeof STATUS_BY_EVENT;
  threadId: string;
  laneId: string;
  at: number;
  purpose?: string;
}

export interface LaneRow {
  readonly threadId: string;
  readonly laneId: string;
  readonly status: (typeof STATUS_BY_EVENT)[LaneEvent["type"]];
  readonly lastEventAt: number;
  readonly lastStepAt?: number;
  readonly purpose?: string;
}

export type LaneState = ReadonlyMap<string, {
  readonly lanes: ReadonlyMap<string, LaneRow>;
  readonly runningCount: number;
}>;

export function emptyLaneState(): LaneState {
  return new Map();
}

export function runningCount(state: LaneState, threadId: string): number {
  return state.get(threadId)?.runningCount ?? 0;
}

function capPurpose(purpose: string): string {
  let prefix = "";
  let count = 0;
  for (const character of purpose) {
    prefix += character;
    if (++count === 200) break;
  }
  return prefix;
}

export function applyLaneEvent(state: LaneState, event: LaneEvent): LaneState {
  const { type, threadId, laneId, at } = event;
  const thread = state.get(threadId);
  const previous = thread?.lanes.get(laneId);
  if (previous) {
    if (type === "lane-started" || at < previous.lastEventAt) return state;
    if (previous.status !== "running" && previous.status !== "waiting") return state;
  }

  const status = STATUS_BY_EVENT[type];
  const lastStepAt = type === "lane-step" ? at : previous?.lastStepAt;
  const purpose = event.purpose === undefined ? previous?.purpose : capPurpose(event.purpose);
  if (previous?.lastEventAt === at && previous.status === status
    && previous.lastStepAt === lastStepAt && previous.purpose === purpose) return state;

  const row: LaneRow = {
    threadId,
    laneId,
    status,
    lastEventAt: at,
    ...(lastStepAt === undefined ? {} : { lastStepAt }),
    ...(purpose === undefined ? {} : { purpose }),
  };
  const lanes = new Map(thread?.lanes);
  lanes.set(laneId, row);

  const runningDelta = Number(status === "running") - Number(previous?.status === "running");
  const next = new Map(state);
  next.set(threadId, { lanes, runningCount: runningCount(state, threadId) + runningDelta });
  return next;
}
