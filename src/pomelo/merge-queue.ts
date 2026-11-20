export interface MergeQueuePr {
  readonly ticketNumber: number;
  readonly base: string;
  readonly ready: boolean;
  /** The required checks ran against the current base. */
  readonly fresh: boolean;
  readonly held: boolean;
  readonly draft?: boolean;
}

export interface MergeQueueDecision {
  ticketNumber: number;
  reason: string;
}

export interface MergeQueueResult {
  mergeNow: MergeQueueDecision | null;
  updateFirst: MergeQueueDecision[];
  waiting: MergeQueueDecision[];
  reason: string;
}

/**
 * Pick one PR from the current snapshot in ticket order. After a merge, the
 * caller must recompute freshness against the new base before picking again.
 */
export function pickNextMerge(prs: readonly MergeQueuePr[], expectedBase: string): MergeQueueResult {
  const ordered = [...prs].sort((a, b) => a.ticketNumber - b.ticketNumber);
  const updateFirst: MergeQueueDecision[] = [];
  const waiting: MergeQueueDecision[] = [];
  let mergeNow: MergeQueueDecision | null = null;

  for (const { ticketNumber, base, ready, fresh, held, draft } of ordered) {
    const ticket = `Ticket #${ticketNumber}`;
    if (base !== expectedBase) {
      waiting.push({ ticketNumber, reason: `${ticket} targets a different base branch.` });
    } else if (held) {
      waiting.push({ ticketNumber, reason: `${ticket} is on hold.` });
    } else if (draft) {
      waiting.push({ ticketNumber, reason: `${ticket} is a draft.` });
    } else if (!ready) {
      waiting.push({ ticketNumber, reason: `${ticket} has not passed its readiness checks.` });
    } else if (!fresh) {
      updateFirst.push({ ticketNumber, reason: `${ticket} must update to the current base and rerun checks.` });
    } else if (mergeNow) {
      waiting.push({
        ticketNumber,
        reason: `${ticket} must wait for ticket #${mergeNow.ticketNumber} to merge, then update and rerun checks.`,
      });
    } else {
      mergeNow = { ticketNumber, reason: `${ticket} may merge now.` };
    }
  }

  return { mergeNow, updateFirst, waiting, reason: mergeNow?.reason ?? "There is nothing to merge." };
}
