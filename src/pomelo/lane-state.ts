export const LANE_STATUSES = Object.freeze(["running", "waiting", "stuck", "done", "failed", "cancelled"] as const);

type LaneStatus = (typeof LANE_STATUSES)[number];

const ALLOWED_MOVES: Record<LaneStatus, readonly LaneStatus[]> = {
  running: ["waiting", "stuck", "done", "failed", "cancelled"],
  waiting: ["running", "done", "failed", "cancelled"],
  stuck: ["running", "done", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: [],
};

function isLaneStatus(status: unknown): status is LaneStatus {
  return typeof status === "string" && Object.hasOwn(ALLOWED_MOVES, status);
}

export function isFinalLaneStatus(status: unknown): boolean {
  return isLaneStatus(status) && ALLOWED_MOVES[status].length === 0;
}

/** Check a requested move against the lane's last change without updating either input. */
export function laneMove(
  { status: from, changedAt }: { status: unknown; changedAt?: unknown },
  { status: to, at }: { status: unknown; at?: unknown },
): { ok: boolean; noop: boolean; reason: string } {
  if (!isLaneStatus(from) || !isLaneStatus(to)) {
    return { ok: false, noop: false, reason: "unknown-status" };
  }
  if (typeof changedAt !== "number" || !Number.isFinite(changedAt) || typeof at !== "number" || !Number.isFinite(at)) {
    return { ok: false, noop: false, reason: "invalid-time" };
  }
  if (at < changedAt) return { ok: false, noop: false, reason: "late-event" };
  if (from === to) return { ok: true, noop: true, reason: "noop" };
  if (isFinalLaneStatus(from)) return { ok: false, noop: false, reason: "final-status" };
  if (ALLOWED_MOVES[from].includes(to)) return { ok: true, noop: false, reason: "allowed" };
  return { ok: false, noop: false, reason: "invalid-transition" };
}
