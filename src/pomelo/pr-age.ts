const HOUR_MS = 60 * 60 * 1_000;

export const DEFAULT_RUNNING_CHECKS_LIMIT_MS = 2 * HOUR_MS;
export const DEFAULT_PR_AGE_LIMIT_MS = 6 * HOUR_MS;

export interface PrAgeInput {
  ticket: number;
  openedAt?: number | null;
  lastPushAt?: number | null;
  checkState: "failed" | "running" | "passed";
  reviewState: "pending" | "changes_requested" | "approved";
  behindBase: boolean;
  draft: boolean;
  hold: boolean;
}

export interface PrAgeLimits {
  /** Time since the last push for a PR with running checks. */
  runningChecksMs?: number;
  /** Time since opening for all other PRs. */
  generalMs?: number;
}

export type PrAgeReason =
  | "checks_failing"
  | "checks_running_too_long"
  | "awaiting_review"
  | "behind_base"
  | "parked"
  | "ready_not_merged"
  | "bad_input";

export interface StalePr {
  ticket: number;
  reason: PrAgeReason;
}

function staleReason(pr: PrAgeInput, now: number, runningChecksMs: number, generalMs: number): PrAgeReason | undefined {
  const { openedAt, lastPushAt } = pr;
  if (typeof openedAt !== "number" || typeof lastPushAt !== "number" ||
      !Number.isFinite(openedAt) || !Number.isFinite(lastPushAt) || !Number.isFinite(now)) {
    return "bad_input";
  }

  if (pr.checkState === "running") {
    return now - lastPushAt > runningChecksMs ? "checks_running_too_long" : undefined;
  }
  if (now - openedAt <= generalMs) return undefined;
  if (pr.checkState === "failed") return "checks_failing";
  if (pr.reviewState !== "approved") return "awaiting_review";
  if (pr.behindBase) return "behind_base";
  if (pr.draft || pr.hold) return "parked";
  return "ready_not_merged";
}

/** Report overdue open ticket PRs using caller-supplied timestamps in milliseconds. */
export function stalePrs(
  prs: readonly PrAgeInput[],
  now: number,
  { runningChecksMs = DEFAULT_RUNNING_CHECKS_LIMIT_MS, generalMs = DEFAULT_PR_AGE_LIMIT_MS }: PrAgeLimits = {},
): StalePr[] {
  const report: StalePr[] = [];
  for (const pr of prs) {
    const reason = staleReason(pr, now, runningChecksMs, generalMs);
    if (reason !== undefined) report.push({ ticket: pr.ticket, reason });
  }
  return report.sort((a, b) => a.ticket - b.ticket);
}
