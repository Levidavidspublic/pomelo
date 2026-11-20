export type RunTicketOutcome = "merged" | "stuck" | "held";

export interface RunBudgetLimits {
  readonly maxMinutes: number;
  readonly maxAttempts: number;
  readonly maxStuckInARow: number;
}

export interface RunBudgetInput {
  /** Run start and snapshot time in milliseconds, from the same clock. */
  readonly startedAt: number;
  readonly now: number;
  readonly attemptsUsed: number;
  /** Finished ticket outcomes, oldest first. */
  readonly outcomes: readonly RunTicketOutcome[];
  readonly limits?: RunBudgetLimits;
}

export interface RunBudgetResult {
  verdict: "go" | "stop";
  reasons: string[];
  left: { minutes: number; attempts: number };
}

export const DEFAULT_RUN_BUDGET: RunBudgetLimits = Object.freeze({
  maxMinutes: 120,
  maxAttempts: 30,
  maxStuckInARow: 3,
});

/** Check the budget for the entire kitchen run from a supplied snapshot. */
export function runBudget(input: RunBudgetInput): RunBudgetResult {
  const { startedAt, now, attemptsUsed, outcomes, limits = DEFAULT_RUN_BUDGET } = input;
  if (
    !limits ||
    [startedAt, now, attemptsUsed, limits.maxMinutes, limits.maxAttempts, limits.maxStuckInARow]
      .some((value) => !Number.isFinite(value) || value < 0) ||
    now < startedAt
  ) {
    return {
      verdict: "stop",
      reasons: ["bad input (expected finite, non-negative numbers and now at or after the run start)"],
      left: { minutes: 0, attempts: 0 },
    };
  }

  let stuckInARow = 0;
  for (let index = outcomes.length - 1; index >= 0; index--) {
    const outcome = outcomes[index];
    if (outcome === "merged") break;
    if (outcome === "stuck") stuckInARow++;
  }

  const { maxMinutes, maxAttempts, maxStuckInARow } = limits;
  const elapsedMinutes = (now - startedAt) / 60_000;
  const reasons: string[] = [];
  if (elapsedMinutes >= maxMinutes) reasons.push(`Run time limit reached (${maxMinutes} minutes).`);
  if (attemptsUsed >= maxAttempts) reasons.push(`Run attempt limit reached (${maxAttempts} attempts).`);
  if (stuckInARow >= maxStuckInARow) reasons.push(`Stuck ticket limit reached (${maxStuckInARow} in a row).`);

  return {
    verdict: reasons.length ? "stop" : "go",
    reasons,
    left: {
      minutes: Math.max(0, maxMinutes - elapsedMinutes),
      attempts: Math.max(0, maxAttempts - attemptsUsed),
    },
  };
}
