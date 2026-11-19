import type { TaskMarkState } from "../TaskMark.js";

export interface LaneLike {
  threadId: string;
  laneId: string;
  spawnedBy: string;
  purpose: string;
  status: "running" | "done" | "failed" | "cancelled";
  createdAt: number;
  endedAt?: number;
}

const MARK = {
  running: "working",
  done: "done",
  failed: "blocked",
  cancelled: "open", // Friday's subagent list draws this state with a stop icon.
} as const satisfies Record<LaneLike["status"], TaskMarkState>;

export interface PomeloSubagentRow {
  id: string;
  title: string;
  by: string;
  status: (typeof MARK)[LaneLike["status"]];
  tone: "neutral" | "bad";
  endedAt?: number;
}

export function pomeloSubagentRows(lanes: readonly LaneLike[], threadId: string): PomeloSubagentRow[] {
  return lanes
    .filter((lane) => lane.threadId === threadId)
    .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || b.createdAt - a.createdAt)
    .map((lane) => {
      const purpose = lane.purpose.trim().replace(/\s+/g, " ");
      return {
        id: lane.laneId,
        title: Array.from(purpose).slice(0, 120).join("") || "Sub-agent",
        by: lane.spawnedBy,
        status: MARK[lane.status],
        tone: lane.status === "failed" ? "bad" : "neutral",
        ...(lane.endedAt !== undefined ? { endedAt: lane.endedAt } : {}),
      };
    });
}

export function pomeloSubagentTally(rows: readonly PomeloSubagentRow[]) {
  const marks = { working: 0, done: 0, blocked: 0, open: 0 };
  for (const row of rows) marks[row.status]++;

  const { working: running, done, blocked: failed, open: cancelled } = marks;
  const text = [
    running ? `${running} working` : "",
    done ? `${done} back` : "",
    failed ? `${failed} failed` : "",
    cancelled ? `${cancelled} stopped` : "",
  ].filter(Boolean).join(", ");
  return { running, done, failed, cancelled, text };
}
