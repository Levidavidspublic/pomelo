export interface AttemptTicket {
  readonly number: number;
  readonly failedAttempts: number;
  readonly state: string;
  readonly when: readonly number[];
}

export type TicketMove =
  | { readonly number: number; readonly move: "ready" | "retry" | "stuck" | "done" }
  | { readonly number: number; readonly move: "waiting"; readonly waitingOn: readonly number[] };

/** Evaluate each ticket against the completion state of its direct dependencies. */
export function ticketMoves(tickets: readonly AttemptTicket[], maxAttempts = 3): readonly TicketMove[] {
  const done = new Set<number>();
  for (const ticket of tickets) {
    if (ticket.state === "done") done.add(ticket.number);
  }

  return Object.freeze(tickets.map(({ number, failedAttempts, state, when }): TicketMove => {
    if (state === "done") return Object.freeze({ number, move: "done" });
    if (failedAttempts >= maxAttempts) return Object.freeze({ number, move: "stuck" });

    const waitingOn = when.filter((dependency) => !done.has(dependency));
    if (waitingOn.length > 0) {
      return Object.freeze({ number, move: "waiting", waitingOn: Object.freeze(waitingOn) });
    }

    return Object.freeze({ number, move: failedAttempts > 0 ? "retry" : "ready" });
  }));
}
