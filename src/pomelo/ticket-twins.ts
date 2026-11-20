import { scopePaths } from "./scope-overlap.js";

export interface TicketTwinInput {
  key: string;
  title: string;
  scope?: string;
  state?: string;
}

export interface TicketTwinFinding {
  newKey: string;
  otherKey: string;
  reason: string;
}

function prepareTicket(ticket: TicketTwinInput) {
  const paths = scopePaths((ticket.scope ?? "").replaceAll("\\", "/"));
  return {
    ticket,
    title: ticket.title.trim().toLowerCase(),
    paths: paths.filter((path) =>
      /^src\/(?:client\/)?pomelo\/.*[^/]$/.test(path) || /^test\/[^/]+\.test\.ts$/.test(path)
    ).sort(),
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Compare each new ticket against the existing tickets, regardless of state. */
export function findTicketTwins(
  newTickets: readonly TicketTwinInput[],
  existingTickets: readonly TicketTwinInput[],
): TicketTwinFinding[] {
  const existing = existingTickets.map(prepareTicket);
  const findings: TicketTwinFinding[] = [];

  for (const ticket of newTickets) {
    const draft = prepareTicket(ticket);
    for (const other of existing) {
      if (ticket === other.ticket) continue;

      const newKey = ticket.key;
      const otherKey = other.ticket.key;
      if (newKey === otherKey) {
        findings.push({ newKey, otherKey, reason: "Same key" });
        continue;
      }

      const sharedPath = draft.paths.find((path) => other.paths.includes(path));
      if (sharedPath !== undefined) {
        findings.push({ newKey, otherKey, reason: `Shared file ${sharedPath}` });
      } else if (draft.title === other.title) {
        findings.push({ newKey, otherKey, reason: "Same title" });
      }
    }
  }

  return findings.sort((a, b) =>
    compareStrings(a.newKey, b.newKey) || compareStrings(a.otherKey, b.otherKey) || compareStrings(a.reason, b.reason)
  );
}
