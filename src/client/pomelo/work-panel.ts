export type WorkPanelDriver = "claude" | "codex" | "opencode" | "other";
export type WorkPanelLaneState = "running" | "waiting" | "stuck" | "done";
export type WorkPanelCallState = "running" | "waiting" | "failed" | "done";

export interface LaneLike {
  id: string;
  name: string;
  /** Friday's lane flag can be replaced with the tool and model from its attachment. */
  engine?: boolean | { tool?: string; model?: string } | null;
  tool?: string;
  /** A model reported for this lane when the attachment omits it. */
  model?: string;
  state: WorkPanelLaneState;
  lastActivityAt?: number;
}

/** A call's name and ID, with its lane, start time and state from the event projection. */
export interface ToolCallLike {
  id: string;
  laneId: string;
  name: string;
  state: WorkPanelCallState;
  startedAt: number;
}

export interface WorkPanelCallRow {
  id: string;
  tool: string;
  state: WorkPanelCallState;
  startedAt: number;
}

export interface WorkPanelLaneRow {
  laneId: string;
  name: string;
  driver: WorkPanelDriver;
  model: string;
  state: WorkPanelLaneState;
  calls: WorkPanelCallRow[];
  moreCalls: number;
}

const STATE_ORDER: Record<WorkPanelLaneState, number> = {
  running: 0,
  waiting: 1,
  stuck: 2,
  done: 3,
};
const CALL_LIMIT = 50;

function driverFor(tool: string | undefined): WorkPanelDriver {
  switch (tool?.trim().toLowerCase()) {
    case "claude":
    case "claude code":
    case "claude-code":
      return "claude";
    case "codex":
      return "codex";
    case "opencode":
      return "opencode";
    default:
      return "other";
  }
}

export function pomeloWorkPanel(lanes: readonly LaneLike[], calls: readonly ToolCallLike[]): WorkPanelLaneRow[] {
  const callsByLane = new Map<string, WorkPanelCallRow[]>();
  for (const lane of lanes) callsByLane.set(lane.id, []);
  for (const call of calls) {
    callsByLane.get(call.laneId)?.push({
      id: call.id,
      tool: call.name,
      state: call.state,
      startedAt: call.startedAt,
    });
  }
  for (const laneCalls of callsByLane.values()) {
    laneCalls.sort((a, b) => b.startedAt - a.startedAt);
  }

  const sections = lanes.map((lane) => {
    const laneCalls = callsByLane.get(lane.id) ?? [];
    const engine = typeof lane.engine === "object" ? lane.engine : undefined;
    const activityAt = Math.max(lane.lastActivityAt ?? 0, laneCalls[0]?.startedAt ?? 0);
    const row: WorkPanelLaneRow = {
      laneId: lane.id,
      name: lane.name,
      driver: driverFor(engine?.tool ?? lane.tool),
      model: engine?.model?.trim() || lane.model?.trim() || "not reported",
      state: lane.state,
      calls: laneCalls.slice(0, CALL_LIMIT),
      moreCalls: Math.max(0, laneCalls.length - CALL_LIMIT),
    };
    return { row, activityAt };
  });

  return sections
    .sort((a, b) => STATE_ORDER[a.row.state] - STATE_ORDER[b.row.state] || b.activityAt - a.activityAt)
    .map(({ row }) => row);
}
