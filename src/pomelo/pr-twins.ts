export interface PrTwinTicket {
  number: number;
  key: string;
}

export interface PrTwinFinding {
  ticket: number;
  prs: number[];
}

export type PrTwinVerdict = "open-new" | "reuse" | "stop";

export interface PrTwinResult {
  ok: boolean;
  verdict: PrTwinVerdict;
  reuse?: number;
  twins: PrTwinFinding[];
  reasons: string[];
}

const ticketBranch = /^ticket\/([0-9]+)-[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** Check a caller-supplied snapshot of open PRs, including drafts. */
export function prTwins(prListJsonText: string, ticket: PrTwinTicket): PrTwinResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(prListJsonText);
  } catch {
    return { ok: false, verdict: "stop", twins: [], reasons: ["The PR list is not valid JSON."] };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, verdict: "stop", twins: [], reasons: ["The PR list must be a JSON array."] };
  }

  const expectedBranch = `ticket/${ticket.number}-${ticket.key.toLowerCase()}`;
  const entries: unknown[] = parsed;
  const prsByTicket = new Map<number, Map<number, boolean>>();
  const reasons: string[] = [];

  for (const [index, pr] of entries.entries()) {
    if (typeof pr !== "object" || pr === null || !("headRefName" in pr) ||
        typeof pr.headRefName !== "string" || pr.headRefName.trim() === "") {
      reasons.push(`PR list entry ${index + 1} needs a headRefName.`);
      continue;
    }
    const { headRefName } = pr;
    if (!headRefName.startsWith("ticket/")) continue;

    if (!("number" in pr) || typeof pr.number !== "number" ||
        !Number.isSafeInteger(pr.number) || pr.number <= 0) {
      reasons.push(`PR list entry ${index + 1} needs a valid PR number.`);
      continue;
    }

    const branchMatch = ticketBranch.exec(headRefName);
    const branchTicket = branchMatch ? Number(branchMatch[1]) : undefined;
    const ticketNumbers = new Set<number>();
    if (branchTicket !== undefined) ticketNumbers.add(branchTicket);
    if ("title" in pr && typeof pr.title === "string") {
      for (const match of pr.title.matchAll(/#(\d+)\b/g)) {
        ticketNumbers.add(Number(match[1]));
      }
    }

    for (const ticketNumber of ticketNumbers) {
      if (!Number.isSafeInteger(ticketNumber) || ticketNumber <= 0) continue;
      const wrongBranch = ticketNumber === ticket.number
        ? headRefName !== expectedBranch
        : branchTicket !== ticketNumber;
      const prs = prsByTicket.get(ticketNumber) ?? new Map<number, boolean>();
      prs.set(pr.number, wrongBranch || prs.get(pr.number) === true);
      prsByTicket.set(ticketNumber, prs);
    }
  }

  const twins: PrTwinFinding[] = [];
  let reuse: number | undefined;
  for (const [ticketNumber, prs] of [...prsByTicket].sort(([a], [b]) => a - b)) {
    const numbers = [...prs.keys()].sort((a, b) => a - b);
    const wrongBranchPrs = numbers.filter((number) => prs.get(number));
    if (numbers.length > 1 || wrongBranchPrs.length > 0) {
      twins.push({ ticket: ticketNumber, prs: numbers });
    }
    if (ticketNumber !== ticket.number) continue;

    if (numbers.length > 1) {
      reasons.push(`Ticket #${ticketNumber} has multiple open PRs (${numbers.map((number) => `#${number}`).join(", ")}).`);
    }
    if (wrongBranchPrs.length > 0) {
      reasons.push(`Open PRs (${wrongBranchPrs.map((number) => `#${number}`).join(", ")}) for ticket #${ticketNumber} must use ${expectedBranch}.`);
    }
    reuse = numbers[0];
  }

  if (reasons.length > 0) return { ok: false, verdict: "stop", twins, reasons };
  if (reuse !== undefined) return { ok: true, verdict: "reuse", reuse, twins, reasons };
  return { ok: true, verdict: "open-new", twins, reasons };
}
