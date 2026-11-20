import type { BrowserJobState } from "../browser-records.js";

/** A snapshot of the blockers still open when the agent reports a result. */
export interface JobFinishFacts {
  state: BrowserJobState;
  heldSteps: readonly unknown[];
  pendingApprovals: readonly unknown[];
  liveGrants: readonly unknown[];
  runningDownloads: number;
  runningImports: number;
  lastVerdict: string;
  resultLine?: string;
}

type FinishReason =
  | "bad_input"
  | "already_final"
  | "not_started"
  | "job_waiting"
  | "held_step_open"
  | "approval_pending"
  | "grant_live"
  | "download_running"
  | "import_running"
  | "no_result"
  | "last_step_stopped"
  | "last_step_waiting";

interface JobFinishResult {
  decision: "done" | "not_yet" | "hold";
  reasons: FinishReason[];
  line: string;
}

interface Blocker {
  decision: "not_yet" | "hold";
  reason: FinishReason;
  detail: string;
}

// Read snapshot fields without running getters or using inherited defaults.
function ownValue(record: object, key: keyof JobFinishFacts | "length"): unknown {
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

function blockerCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 1;
}

function listCount(value: unknown): number {
  return Array.isArray(value) ? blockerCount(ownValue(value, "length")) : 1;
}

function checkFacts(facts: object): JobFinishResult | undefined {
  const state = ownValue(facts, "state");
  if (state === "done" || state === "failed" || state === "cancelled") {
    return { decision: "not_yet", reasons: ["already_final"], line: "Not finished yet: the job has already ended" };
  }
  if (state !== "running" && state !== "queued" && state !== "waiting") return undefined;

  const blockers: Blocker[] = [];
  if (state === "queued") {
    blockers.push({ decision: "not_yet", reason: "not_started", detail: "the job has not started" });
  }
  if (state === "waiting") {
    blockers.push({ decision: "hold", reason: "job_waiting", detail: "the job is waiting" });
  }

  const heldSteps = listCount(ownValue(facts, "heldSteps"));
  if (heldSteps > 0) {
    blockers.push({
      decision: "hold", reason: "held_step_open",
      detail: heldSteps === 1 ? "1 step needs an answer" : `${heldSteps} steps need an answer`,
    });
  }
  const pendingApprovals = listCount(ownValue(facts, "pendingApprovals"));
  if (pendingApprovals > 0) {
    blockers.push({
      decision: "hold", reason: "approval_pending",
      detail: pendingApprovals === 1 ? "1 approval needs an answer" : `${pendingApprovals} approvals need an answer`,
    });
  }
  const liveGrants = listCount(ownValue(facts, "liveGrants"));
  if (liveGrants > 0) {
    blockers.push({
      decision: "not_yet", reason: "grant_live",
      detail: `${liveGrants} fill grant${liveGrants === 1 ? "" : "s"} still live`,
    });
  }
  const runningDownloads = blockerCount(ownValue(facts, "runningDownloads"));
  if (runningDownloads > 0) {
    blockers.push({
      decision: "not_yet", reason: "download_running",
      detail: `${runningDownloads} download${runningDownloads === 1 ? "" : "s"} still running`,
    });
  }
  const runningImports = blockerCount(ownValue(facts, "runningImports"));
  if (runningImports > 0) {
    blockers.push({
      decision: "not_yet", reason: "import_running",
      detail: `${runningImports} import${runningImports === 1 ? "" : "s"} still running`,
    });
  }

  const resultLine = ownValue(facts, "resultLine");
  if (typeof resultLine !== "string" || resultLine.trim().length === 0) {
    blockers.push({ decision: "not_yet", reason: "no_result", detail: "the agent has no result yet" });
  }
  const lastVerdict = ownValue(facts, "lastVerdict");
  if (lastVerdict === "wait") {
    blockers.push({ decision: "not_yet", reason: "last_step_waiting", detail: "the last step is still waiting" });
  } else if (lastVerdict !== "go") {
    blockers.push({ decision: "hold", reason: "last_step_stopped", detail: "the last step stopped" });
  }

  // Keep reasons in check order. The line uses the first blocker of the winning decision.
  const first = blockers.find(({ decision }) => decision === "hold") ?? blockers[0];
  if (!first) return { decision: "done", reasons: [], line: "Finished" };
  const prefix = first.decision === "hold" ? "Waiting for you" : "Not finished yet";
  return {
    decision: first.decision,
    reasons: blockers.map(({ reason }) => reason),
    line: `${prefix}: ${first.detail}`,
  };
}

/** Evaluate finish facts without changing the job or returning its text. */
export function jobFinish(facts: unknown): JobFinishResult {
  try {
    if (typeof facts === "object" && facts !== null && !Array.isArray(facts)) {
      const result = checkFacts(facts);
      if (result) return result;
    }
  } catch {
    // Unreadable input, such as a revoked proxy, cannot establish completion.
  }
  return { decision: "not_yet", reasons: ["bad_input"], line: "Not finished yet: job facts are unavailable" };
}
