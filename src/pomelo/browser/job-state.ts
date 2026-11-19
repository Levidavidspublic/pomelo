export type JobState = "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";
export type JobActor = "worker" | "amit" | "agent";

export type JobMoveResult =
  | { ok: true; reason: "allowed" | "no_change" }
  | { ok: false; reason: "bad_input" | "not_allowed_for_agent" | "must_run_first" | "invalid_transition" };

const ALLOWED_MOVES: Record<JobState, readonly JobState[]> = {
  queued: ["running", "cancelled"],
  running: ["waiting", "done", "failed", "cancelled"],
  waiting: ["running", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: [],
};

function isJobState(state: unknown): state is JobState {
  return typeof state === "string" && Object.hasOwn(ALLOWED_MOVES, state);
}

function isJobActor(actor: unknown): actor is JobActor {
  return actor === "worker" || actor === "amit" || actor === "agent";
}

/** Check a requested transition without changing the job or its profile lock. */
export function checkJobMove(move: unknown): JobMoveResult {
  if (typeof move !== "object" || move === null || !("from" in move) || !("to" in move) || !("by" in move)) {
    return { ok: false, reason: "bad_input" };
  }

  const { from, to, by } = move;
  if (!isJobState(from) || !isJobState(to) || !isJobActor(by)) {
    return { ok: false, reason: "bad_input" };
  }
  if (from === to) return { ok: true, reason: "no_change" };
  if (by === "agent" && (to === "done" || to === "failed")) {
    return { ok: false, reason: "not_allowed_for_agent" };
  }
  if (ALLOWED_MOVES[from].includes(to)) return { ok: true, reason: "allowed" };
  if (to === "done" && (from === "queued" || from === "waiting")) {
    return { ok: false, reason: "must_run_first" };
  }
  return { ok: false, reason: "invalid_transition" };
}

export function isFinal(state: unknown): boolean {
  return isJobState(state) && ALLOWED_MOVES[state].length === 0;
}

export function releasesLock(state: unknown): boolean {
  return isFinal(state);
}
