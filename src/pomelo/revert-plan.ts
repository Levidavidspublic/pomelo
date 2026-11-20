export type RevertPlanCheck = "pass" | "fail" | "pending" | "unknown";

export interface RevertPlanCommit {
  readonly sha: string;
  readonly ticketNumber?: number | null;
  readonly subject: string;
  readonly check: RevertPlanCheck;
}

export interface RevertPlanTicket {
  readonly sha: string;
  readonly ticketNumber: number;
}

export type RevertPlan =
  | { verdict: "nothing_to_do"; reason: "checks_passed" }
  | { verdict: "wait"; reason: "checks_pending" | "checks_unknown" }
  | { verdict: "ask_amit"; reason: "bad_input" | "not_ticket_merge" | "failed_revert" | "multiple_failures" }
  | (RevertPlanTicket & {
    verdict: "revert";
    reason: "ticket_failed";
    method: "revert_pr";
    rerun: readonly RevertPlanTicket[];
  });

function isCommit(value: unknown): value is RevertPlanCommit {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { sha, ticketNumber, subject, check } = value as Record<string, unknown>;
  return typeof sha === "string" && sha.length > 0 && sha.trim() === sha
    && typeof subject === "string" && subject.trim().length > 0
    && (ticketNumber == null
      || (typeof ticketNumber === "number" && Number.isSafeInteger(ticketNumber) && ticketNumber > 0))
    && (check === "pass" || check === "fail" || check === "pending" || check === "unknown");
}

function isHistory(value: unknown): value is readonly RevertPlanCommit[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seen = new Set<string>();
  for (const commit of value) {
    if (!isCommit(commit) || seen.has(commit.sha)) return false;
    seen.add(commit.sha);
  }
  return true;
}

/** Plan from main's recent commits in oldest-to-newest order. */
export function planRevert(commits: unknown): RevertPlan {
  if (!isHistory(commits)) return { verdict: "ask_amit", reason: "bad_input" };

  const newestFinished = commits.findLast(({ check }) => check === "pass" || check === "fail");
  if (newestFinished?.check === "pass") {
    return { verdict: "nothing_to_do", reason: "checks_passed" };
  }

  const lastPass = commits.findLastIndex(({ check }) => check === "pass");
  const first = commits[lastPass + 1];
  if (first.check === "pending") return { verdict: "wait", reason: "checks_pending" };
  if (first.check === "unknown") return { verdict: "wait", reason: "checks_unknown" };
  if (first.subject.startsWith("Revert")) return { verdict: "ask_amit", reason: "failed_revert" };
  if (first.ticketNumber == null) return { verdict: "ask_amit", reason: "not_ticket_merge" };

  const later = commits.slice(lastPass + 2);
  // A known green-to-red transition identifies the first failure. If the
  // window already starts red, several failures leave the transition unclear.
  if (lastPass < 0 && later.some(({ check }) => check === "fail")) {
    return { verdict: "ask_amit", reason: "multiple_failures" };
  }

  const rerun: RevertPlanTicket[] = [];
  for (const { sha, ticketNumber } of later) {
    if (ticketNumber != null) rerun.push({ sha, ticketNumber });
  }
  return {
    verdict: "revert",
    reason: "ticket_failed",
    method: "revert_pr",
    sha: first.sha,
    ticketNumber: first.ticketNumber,
    rerun,
  };
}
