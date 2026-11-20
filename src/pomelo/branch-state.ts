export type BranchStateVerdict = "ready" | "wrong_branch" | "detached" | "behind" | "unmerged" | "unreadable";

export interface BranchStateResult {
  ok: boolean;
  verdict: BranchStateVerdict;
  head: string | null;
  ahead: number | null;
  behind: number | null;
  reason: string;
}

const ticketBranch = /^ticket\/[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const branchHeader = /^# branch\.(oid|head|upstream|ab)(?: (.*))?$/;
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const refText = /^[^\x00-\x20\x7f]+$/;

/**
 * Check line-oriented Git status porcelain v2 with branch headers.
 * A merge with all conflicts staged has no operation marker in this format.
 */
export function checkBranchState(statusText: string, { expected }: { expected: string }): BranchStateResult {
  const headers = new Map<string, string>();
  let duplicateHeader = false;
  let unmerged = false;

  for (const line of statusText.split(/\r?\n/)) {
    const header = branchHeader.exec(line);
    if (header) {
      const [, name, value = ""] = header;
      if (headers.has(name)) duplicateHeader = true;
      headers.set(name, value);
    } else if (line.startsWith("u ")) {
      unmerged = true;
    }
  }

  const oid = headers.get("oid") ?? "";
  const headText = headers.get("head") ?? "";
  const head = refText.test(headText) ? headText : null;
  const upstream = headers.get("upstream");
  const ab = headers.get("ab");
  const counts = /^\+(\d+) -(\d+)$/.exec(ab ?? "");
  const ahead = counts ? Number(counts[1]) : null;
  const behind = counts ? Number(counts[2]) : null;
  const validCounts = Number.isSafeInteger(ahead) && Number.isSafeInteger(behind);

  function result(verdict: BranchStateVerdict, reason: string): BranchStateResult {
    return {
      ok: verdict === "ready",
      verdict,
      head,
      ahead: validCounts ? ahead : null,
      behind: validCounts ? behind : null,
      reason,
    };
  }

  if (!ticketBranch.test(expected)) {
    return result("unreadable", "Unreadable check input because the expected ticket branch must use ticket/<number>-<key>.");
  }
  if (duplicateHeader || head === null) {
    return result("unreadable", "Unreadable Git status because the branch headers are missing or ambiguous.");
  }
  if (oid === "(initial)") {
    return result("unreadable", "Unreadable branch state because HEAD has no commit yet.");
  }
  if (!objectId.test(oid)) {
    return result("unreadable", "Unreadable Git status because the branch object ID is missing or invalid.");
  }
  if (unmerged) {
    return result("unmerged", "Unmerged entries still need to be resolved before committing.");
  }
  if (head === "(detached)") {
    return result("detached", "Detached HEAD requires checking out the ticket branch before committing.");
  }
  if (head !== expected) {
    return result("wrong_branch", `Wrong branch "${head}" is checked out instead of "${expected}".`);
  }
  if ((upstream !== undefined && !refText.test(upstream)) ||
      ((upstream !== undefined || ab !== undefined) && !validCounts)) {
    return result("unreadable", "Unreadable Git status because the upstream comparison is missing or invalid.");
  }
  if (behind !== null && behind > 0) {
    return result("behind", `Behind upstream by ${behind} ${behind === 1 ? "commit" : "commits"}.`);
  }
  return result("ready", `Ready to commit on "${head}".`);
}
