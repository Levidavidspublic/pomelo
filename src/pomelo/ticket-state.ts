const ticketStates = ["new", "running", "pr_open", "done", "stuck", "held"] as const;
type TicketState = (typeof ticketStates)[number];

interface Ticket {
  number: number;
  key: string;
  state: TicketState;
}

interface PullRequest {
  number: number;
  headRefName: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  mergedAt: string | null;
  baseRefName: string;
}

export type TicketStateMismatchKind =
  | "done-not-merged"
  | "merged-not-done"
  | "pr-open-no-pr"
  | "pr-without-ticket"
  | "closed-unmerged";

export interface TicketStateMismatch {
  ticketNumber: number;
  prNumber?: number;
  kind: TicketStateMismatchKind;
  reason: string;
}

export type TicketStateResult =
  | { ok: true; verdict: "clean"; rows: [] }
  | { ok: false; verdict: "mismatch"; rows: TicketStateMismatch[] }
  | { ok: false; verdict: "unreadable"; rows: []; reason: string };

function isRecord(row: unknown): row is Record<string, unknown> {
  return row !== null && typeof row === "object" && !Array.isArray(row);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isTicket(row: unknown): row is Ticket {
  return isRecord(row) && isPositiveInteger(row.number) &&
    typeof row.key === "string" && row.key.trim() !== "" &&
    ticketStates.some((state) => state === row.state);
}

function isPullRequest(row: unknown): row is PullRequest {
  return isRecord(row) && isPositiveInteger(row.number) &&
    typeof row.headRefName === "string" && row.headRefName.trim() !== "" &&
    typeof row.baseRefName === "string" && row.baseRefName.trim() !== "" &&
    (row.state === "OPEN" || row.state === "CLOSED" || row.state === "MERGED") &&
    (row.mergedAt === null ||
      (typeof row.mergedAt === "string" && Number.isFinite(Date.parse(row.mergedAt))));
}

function readRows<T>(input: unknown, isRow: (row: unknown) => row is T): T[] | undefined {
  if (typeof input !== "string") return undefined;
  try {
    const rows: unknown = JSON.parse(input);
    if (Array.isArray(rows) && rows.every(isRow)) return rows;
  } catch {
    return undefined;
  }
}

const prPriority = { MERGED: 3, OPEN: 2, CLOSED: 1 };
type TicketPr = Pick<PullRequest, "number" | "state">;

function selectTicketPrs(prs: PullRequest[]): Map<number, TicketPr> {
  const selected = new Map<number, TicketPr>();
  for (const pr of prs) {
    if (pr.baseRefName !== "main") continue;
    const branch = /^ticket\/(\d+)-\S+$/.exec(pr.headRefName);
    const ticketNumber = Number(branch?.[1]);
    if (!isPositiveInteger(ticketNumber)) continue;

    const state = pr.state === "CLOSED" && pr.mergedAt !== null ? "MERGED" : pr.state;
    const current = selected.get(ticketNumber);
    if (!current || prPriority[state] > prPriority[current.state] ||
        (state === current.state && pr.number > current.number)) {
      selected.set(ticketNumber, { number: pr.number, state });
    }
  }
  return selected;
}

function mismatch(
  ticketNumber: number,
  state: TicketState | undefined,
  pr: TicketPr | undefined,
): TicketStateMismatch | undefined {
  if (state === "done") {
    if (pr?.state === "MERGED") return;
    if (!pr) {
      return { ticketNumber, kind: "done-not-merged", reason: "The ticket is done but has no PR targeting main." };
    }
    return { ticketNumber, prNumber: pr.number, kind: "done-not-merged", reason: "The ticket is done but its PR has not merged." };
  }
  if (pr?.state === "MERGED" && state !== undefined) {
    return { ticketNumber, prNumber: pr.number, kind: "merged-not-done", reason: "The PR merged but the ticket is not done." };
  }
  if (state === "pr_open") {
    if (!pr) {
      return { ticketNumber, kind: "pr-open-no-pr", reason: "The ticket is marked PR open but has no PR targeting main." };
    }
    if (pr.state === "CLOSED") {
      return { ticketNumber, prNumber: pr.number, kind: "closed-unmerged", reason: "The ticket is marked PR open but its PR closed without merging." };
    }
  }
  if (pr?.state === "OPEN" && (state === undefined || state === "new")) {
    const reason = state === "new" ? "The PR is open but the ticket is still new." : "The PR is open but the ticket is missing.";
    return { ticketNumber, prNumber: pr.number, kind: "pr-without-ticket", reason };
  }
}

/** Compare kitchen tickets against PRs targeting main in the supplied JSON snapshots. */
export function checkTicketStates(ticketsJson: unknown, prsJson: unknown): TicketStateResult {
  const tickets = readRows(ticketsJson, isTicket);
  if (!tickets) return { ok: false, verdict: "unreadable", rows: [], reason: "The ticket list is unreadable." };
  const prs = readRows(prsJson, isPullRequest);
  if (!prs) return { ok: false, verdict: "unreadable", rows: [], reason: "The PR list is unreadable." };

  const states = new Map(tickets.map(({ number, state }) => [number, state]));
  const ticketPrs = selectTicketPrs(prs);
  const ticketNumbers = new Set([...states.keys(), ...ticketPrs.keys()]);
  const rows: TicketStateMismatch[] = [];
  for (const number of ticketNumbers) {
    const row = mismatch(number, states.get(number), ticketPrs.get(number));
    if (row) rows.push(row);
  }
  if (rows.length === 0) return { ok: true, verdict: "clean", rows: [] };
  rows.sort((a, b) => a.ticketNumber - b.ticketNumber);
  return { ok: false, verdict: "mismatch", rows };
}
