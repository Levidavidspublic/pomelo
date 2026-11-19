import { hideSecrets } from "../secrets.js";

type ReportLane = {
  threadId: string;
  laneId: string;
  purpose: string;
  status: "running" | "done" | "failed" | "cancelled";
  endedAt?: number;
};

type LaneReport = {
  threadId: string;
  laneId: string;
  kind: "subagent_result";
  status: "done" | "failed" | "cancelled";
  headline: string;
  body: string;
  cut: boolean;
  at: number;
};

export const LANE_REPORT_LIMIT = 2000;

export function laneReport(lane: ReportLane, result: string): { report: LaneReport } | { error: string } {
  const { threadId, laneId, status, endedAt } = lane;
  if (status === "running" || endedAt === undefined) return { error: "Lane must be finished before it can report." };
  if (!threadId.trim() || !laneId.trim()) return { error: "Thread id and lane id are required." };

  let purpose = hideSecrets(lane.purpose).text.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
  if (status !== "done") purpose = purpose.replace(/\bdone\b[ \t]*/gi, "").trim();

  const text = hideSecrets(result).text.trim() || "No result text.";
  const characters = [...text];
  const cut = characters.length > LANE_REPORT_LIMIT;
  return {
    report: {
      threadId,
      laneId,
      kind: "subagent_result",
      status,
      headline: purpose ? `${purpose}: ${status}` : status,
      body: cut ? characters.slice(0, LANE_REPORT_LIMIT).join("") : text,
      cut,
      at: endedAt,
    },
  };
}
