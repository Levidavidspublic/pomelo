import type { PrAgeInput } from "./pr-age.js";

export interface PrBacklogPr extends Pick<PrAgeInput, "openedAt" | "checkState"> {
  readonly number: number;
  readonly ticketKey: string;
  readonly phase: number | string;
  readonly waitingOnAmit: boolean;
}

export interface PrBacklogLimits {
  softLimit?: number;
  hardLimit?: number;
  waitingOnAmitLimit?: number;
}

export interface PrBacklogResult {
  verdict: "go" | "fewer" | "stop";
  open: number;
  waitingOnAmit: number;
  byPhase: Record<string, number>;
  ignored: number;
  /** Remaining room under the hard limit in this snapshot, or zero on stop. */
  mayStart: number;
  reason: string;
}

const DEFAULT_SOFT_LIMIT = 20;
const DEFAULT_HARD_LIMIT = 30;
const DEFAULT_WAITING_ON_AMIT_LIMIT = 15;

function positiveLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Count an open PR snapshot. Records without a ticket key are non-ticket PRs. */
export function prBacklog(prs: unknown, now: number, limits: PrBacklogLimits = {}): PrBacklogResult {
  let open = 0;
  let waitingOnAmit = 0;
  let ignored = 0;
  const phaseCounts = new Map<string, number>();
  const unreadable: PrBacklogResult = {
    verdict: "stop", open: 0, waitingOnAmit: 0, byPhase: {}, ignored: 0, mayStart: 0,
    reason: "The open PR list is missing or unreadable. Stop starting tickets.",
  };

  try {
    if (!Array.isArray(prs)) return unreadable;
    for (const pr of prs) {
      if (pr === null || typeof pr !== "object" || Array.isArray(pr)) return unreadable;
      const record = pr as Record<string, unknown>;
      const { number: prNumber, ticketKey } = record;
      if (typeof prNumber !== "number" || !Number.isSafeInteger(prNumber) || prNumber <= 0) return unreadable;
      if (ticketKey == null || (typeof ticketKey === "string" && ticketKey.trim() === "")) {
        ignored++;
        continue;
      }
      const { phase, waitingOnAmit: waiting } = record;
      if (typeof ticketKey !== "string" || typeof waiting !== "boolean") return unreadable;
      if (typeof phase !== "string" && (typeof phase !== "number" || !Number.isSafeInteger(phase) || phase < 0)) {
        return unreadable;
      }
      const phaseLabel = String(phase).trim();
      if (phaseLabel === "") return unreadable;

      phaseCounts.set(phaseLabel, (phaseCounts.get(phaseLabel) ?? 0) + 1);
      open++;
      if (waiting) waitingOnAmit++;
    }
  } catch {
    return unreadable;
  }

  const counts = { open, waitingOnAmit, byPhase: Object.fromEntries(phaseCounts), ignored };
  if (!Number.isFinite(now)) {
    return { ...counts, verdict: "stop", mayStart: 0, reason: "The current time is unreadable. Stop starting tickets." };
  }

  let softLimit = positiveLimit(limits.softLimit, DEFAULT_SOFT_LIMIT);
  let hardLimit = positiveLimit(limits.hardLimit, DEFAULT_HARD_LIMIT);
  const waitingOnAmitLimit = positiveLimit(limits.waitingOnAmitLimit, DEFAULT_WAITING_ON_AMIT_LIMIT);
  if (softLimit > hardLimit) {
    softLimit = DEFAULT_SOFT_LIMIT;
    hardLimit = DEFAULT_HARD_LIMIT;
  }

  const backlog = `${open} open ticket PR${open === 1 ? "" : "s"}`;
  if (open >= hardLimit) {
    return {
      ...counts, verdict: "stop", mayStart: 0,
      reason: `${backlog} at or above the hard limit of ${hardLimit}. Stop starting tickets.`,
    };
  }
  if (waitingOnAmit >= waitingOnAmitLimit) {
    return {
      ...counts, verdict: "stop", mayStart: 0,
      reason: `The limit of ${waitingOnAmitLimit} open ticket PRs waiting on Amit has been reached (${waitingOnAmit} waiting). Stop starting tickets.`,
    };
  }

  const mayStart = hardLimit - open;
  if (open >= softLimit) {
    return {
      ...counts, verdict: "fewer", mayStart,
      reason: `${backlog} at or above the soft limit of ${softLimit}. Start fewer tickets.`,
    };
  }
  return { ...counts, verdict: "go", mayStart, reason: `${backlog}, below the soft limit of ${softLimit}. Keep starting tickets.` };
}
