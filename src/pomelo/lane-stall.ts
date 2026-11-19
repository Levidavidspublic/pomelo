interface Lane {
  status: "running" | "done" | "failed" | "cancelled";
  createdAt: number;
  endedAt?: number;
}

interface LaneTiming {
  lastStepAt?: number;
  askOpen: boolean;
  now: number;
  quietLimitMs?: number;
}

type ShownState =
  | { state: Lane["status"] }
  | { state: "waiting" | "stuck"; quietMinutes: number };

const MINUTE_MS = 60_000;
const DEFAULT_QUIET_LIMIT_MS = 10 * MINUTE_MS; // EXTRAPOLATED: Amit can tune this default.

export function laneShownState(
  lane: Lane,
  { lastStepAt, askOpen, now, quietLimitMs = DEFAULT_QUIET_LIMIT_MS }: LaneTiming,
): ShownState {
  if (!Number.isFinite(quietLimitMs) || quietLimitMs <= 0) {
    throw new RangeError("The quiet limit must be a finite positive number of milliseconds.");
  }
  if (lane.status !== "running") return { state: lane.status };

  const quietMs = now - (lastStepAt ?? lane.createdAt);
  if (quietMs < 0) return { state: "running" };
  const quietMinutes = Math.floor(quietMs / MINUTE_MS);

  if (askOpen) return { state: "waiting", quietMinutes };
  if (quietMs > quietLimitMs) return { state: "stuck", quietMinutes };
  return { state: "running" };
}
