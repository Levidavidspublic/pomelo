export interface BranchCleanupTicket {
  readonly number: number;
  readonly state: string;
}

interface KeptBranch {
  branch: string;
  reason: string;
}

export interface BranchCleanupResult {
  delete: (KeptBranch & { ticket: number })[];
  keep: KeptBranch[];
}

function protectedBranchReason(branch: string): string | undefined {
  if (branch === "origin/main") return "The fork's main branch is protected.";
  if (branch === "origin/HEAD") return "This is a symbolic ref.";
  if (branch.startsWith("origin/import/")) return "Import branches are protected.";
  if (branch.startsWith("origin/docs/")) return "Docs branches are protected.";
  if (branch.startsWith("upstream/")) return "Upstream branches are protected.";
}

/** Classify the branches in a remote listing against the supplied ticket snapshot. */
export function branchCleanup(branchListText: unknown, tickets: readonly BranchCleanupTicket[]): BranchCleanupResult {
  const result: BranchCleanupResult = { delete: [], keep: [] };
  if (typeof branchListText !== "string" || !branchListText.trim()) return result;

  const states = new Map<number, string>();
  for (const { number, state } of tickets) {
    // If the snapshot contains competing states, any active state keeps the branch.
    if (state !== "done" || !states.has(number)) states.set(number, state);
  }

  for (const rawLine of branchListText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const symbolicRef = /^(\S+)\s+->\s+\S+$/.exec(line);
    const branch = symbolicRef?.[1] ?? line;
    const protectedReason = protectedBranchReason(branch) ?? (symbolicRef ? "This is a symbolic ref." : undefined);
    if (protectedReason) {
      result.keep.push({ branch, reason: protectedReason });
      continue;
    }

    const match = /^origin\/ticket\/(\d+)-p\d+-\d+$/.exec(branch);
    const ticket = Number(match?.[1]);
    if (!Number.isSafeInteger(ticket)) {
      result.keep.push({ branch, reason: "This is outside the fork's ticket branch format." });
      continue;
    }

    const state = states.get(ticket);
    if (state === "done") {
      result.delete.push({ branch, ticket, reason: `Ticket #${ticket} is done.` });
    } else {
      const reason = state === undefined ? `Ticket #${ticket} is missing from the list.` : `Ticket #${ticket} is ${state}.`;
      result.keep.push({ branch, reason });
    }
  }

  result.delete.sort((a, b) => a.ticket - b.ticket);
  return result;
}
