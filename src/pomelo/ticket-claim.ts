export interface TicketClaim {
  readonly ticketKey: string;
  readonly workerId: string;
  /** Last heartbeat in epoch milliseconds. */
  readonly heartbeatAt: number;
}

export interface TicketClaimInput {
  readonly ticketKey: string;
  readonly ticketState: string;
  readonly workerId: string;
  readonly claims: readonly TicketClaim[];
  /** Current time in epoch milliseconds. */
  readonly now: number;
  readonly staleAfterMs: number;
}

export type TicketClaimDecision =
  | { action: "take"; stale?: false }
  | { action: "take"; stale: true; holderId: string }
  | { action: "keep" }
  | { action: "wait"; holderId: string; liveThrough: number }
  | { action: "refuse"; reason: string };

/** Evaluate the current snapshot. A caller acting on `take` must record it atomically against that snapshot. */
export function claimDecision(input: TicketClaimInput): TicketClaimDecision {
  const { ticketKey, ticketState, workerId, claims, now, staleAfterMs } = input;
  if (!ticketKey.trim()) return { action: "refuse", reason: "The ticket key is empty." };
  if (!workerId.trim()) return { action: "refuse", reason: "The worker ID is empty." };

  const matchingClaims = claims.filter((claim) => claim.ticketKey === ticketKey);
  if (matchingClaims.length > 1) {
    const holders = matchingClaims.map((claim) => claim.workerId).join(", ");
    return { action: "refuse", reason: `The ticket has multiple claims from ${holders}.` };
  }

  if (ticketState === "done") return { action: "refuse", reason: "The ticket is already done." };
  if (ticketState === "stuck") return { action: "refuse", reason: "The ticket is stuck." };
  if (ticketState === "held") return { action: "refuse", reason: "The ticket is held for Amit." };

  const claim = matchingClaims[0];
  if (!claim) return { action: "take" };

  const liveThrough = claim.heartbeatAt + staleAfterMs;
  if (!Number.isFinite(now) || !Number.isFinite(liveThrough) || staleAfterMs < 0) {
    return { action: "refuse", reason: "The claim's timing is invalid." };
  }

  if (now > liveThrough) return { action: "take", stale: true, holderId: claim.workerId };
  if (claim.workerId === workerId) return { action: "keep" };
  return { action: "wait", holderId: claim.workerId, liveThrough };
}
