interface Ticket {
  readonly number: number;
  readonly state: string;
  readonly when: readonly number[];
}

interface TicketOrder {
  start: number[];
  waiting: { number: number; waitingOn: number[] }[];
  loops: number[][];
  unknown: { number: number; dependency: number }[];
}

/**
 * Select open tickets using the current states of their direct dependencies.
 * Check all when lists for missing tickets and loops, repeating the first
 * ticket number at the end of each loop to show where it closes.
 */
export function ticketOrder(tickets: readonly Ticket[], freeSlots: number): TicketOrder {
  const ordered = [...tickets].sort((a, b) => a.number - b.number);
  const byNumber = new Map(ordered.map((ticket) => [ticket.number, ticket]));
  const dependencies = new Map<number, number[]>();
  const ready: number[] = [];
  const waiting: TicketOrder["waiting"] = [];
  const unknown: TicketOrder["unknown"] = [];

  for (const { number, state, when } of ordered) {
    const known: number[] = [];
    const waitingOn: number[] = [];
    for (const dependency of new Set(when)) {
      const prerequisite = byNumber.get(dependency);
      if (prerequisite) known.push(dependency);
      else unknown.push({ number, dependency });
      if (prerequisite?.state !== "done") waitingOn.push(dependency);
    }
    dependencies.set(number, known);

    if (state !== "open") continue;
    if (waitingOn.length > 0) waiting.push({ number, waitingOn });
    else ready.push(number);
  }

  return { start: ready.slice(0, Math.max(0, freeSlots)), waiting, loops: findLoops(dependencies), unknown };
}

function findLoops(dependencies: ReadonlyMap<number, readonly number[]>): number[][] {
  const dependants = new Map<number, number[]>();
  for (const [number, when] of dependencies) {
    for (const dependency of when) {
      const previous = dependants.get(dependency);
      if (previous) previous.push(number);
      else dependants.set(dependency, [number]);
    }
  }

  const loops: number[][] = [];
  for (const [first, when] of dependencies) {
    // Each loop starts at its lowest number. Walk reverse edges first so the
    // path search can skip tickets that cannot lead back to that number.
    const canReturn = new Set([first]);
    for (const number of canReturn) {
      for (const dependant of dependants.get(number) ?? []) {
        if (dependant >= first) canReturn.add(dependant);
      }
    }

    const path = new Set([first]);
    const steps = [{ number: first, edges: when.values() }];
    while (steps.length > 0) {
      const step = steps[steps.length - 1];
      const next = step.edges.next();
      if (next.done) {
        steps.pop();
        path.delete(step.number);
        continue;
      }

      const dependency = next.value;
      if (dependency === first) {
        loops.push([...path, first]);
      } else if (canReturn.has(dependency) && !path.has(dependency)) {
        path.add(dependency);
        steps.push({ number: dependency, edges: (dependencies.get(dependency) ?? []).values() });
      }
    }
  }
  return loops;
}
