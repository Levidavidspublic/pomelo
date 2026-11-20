export interface WorkerSlotInput {
  readonly workersRunning: number;
  readonly ticketsStarted: number;
  readonly maxWorkers?: number;
  readonly maxTicketsPerRun?: number;
  readonly mergePaused: boolean;
  readonly uncappedPaidTools: number;
  readonly ticket: { readonly needs_amit: boolean; readonly state: string };
}

export type WorkerSlotResult = { mergePaused: boolean } & (
  | { verdict: "start"; reason: "slot_available" }
  | { verdict: "wait"; reason: "needs_amit" | "ticket_not_new" | "worker_limit" }
  | { verdict: "stop"; reason: "bad_limit" | "bad_count" | "uncapped_paid_tools" | "ticket_limit" }
);

/** Decide from a snapshot whether a worker may start. The pause flag reports merge status. */
export function workerSlot(input: WorkerSlotInput): WorkerSlotResult {
  const { workersRunning, ticketsStarted, maxWorkers, maxTicketsPerRun, mergePaused, uncappedPaidTools, ticket } = input;

  if (maxWorkers === undefined || !Number.isInteger(maxWorkers) || maxWorkers <= 0 ||
      maxTicketsPerRun === undefined || !Number.isInteger(maxTicketsPerRun) || maxTicketsPerRun <= 0) {
    return { verdict: "stop", reason: "bad_limit", mergePaused };
  }

  if ([workersRunning, ticketsStarted, uncappedPaidTools].some((count) => !Number.isInteger(count) || count < 0)) {
    return { verdict: "stop", reason: "bad_count", mergePaused };
  }

  if (uncappedPaidTools > 0) return { verdict: "stop", reason: "uncapped_paid_tools", mergePaused };
  if (ticketsStarted >= maxTicketsPerRun) return { verdict: "stop", reason: "ticket_limit", mergePaused };
  if (ticket.needs_amit) return { verdict: "wait", reason: "needs_amit", mergePaused };
  if (ticket.state !== "new") return { verdict: "wait", reason: "ticket_not_new", mergePaused };
  if (workersRunning >= maxWorkers) return { verdict: "wait", reason: "worker_limit", mergePaused };

  return { verdict: "start", reason: "slot_available", mergePaused };
}
