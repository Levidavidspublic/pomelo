export type StashVerdict = "clean" | "leftovers" | "unreadable";
export type StashKind = "own" | "live" | "orphan" | "unknown";

export interface StashEntry {
  index: number;
  branch: string | null;
  kind: StashKind;
  /** The first 64 characters of the stash subject. */
  message: string;
}

export interface StashCheckOptions {
  ownBranch: string;
  /** Branch names from the caller's live claim snapshot. */
  claimedBranches: readonly string[];
  /** Defaults to main and import/friday-v0.3.4. */
  protectedBranches?: readonly string[];
}

export interface StashCheckResult {
  ok: boolean;
  verdict: StashVerdict;
  stashes: StashEntry[];
  reason: string;
}

const stashLine = /^stash@\{(\d+)\}: (?:WIP on|On) ([^:]*):(?: (.*))?$/s;
const messageLimit = 64;

function classifyBranch(branch: string | null, opts: StashCheckOptions): StashKind {
  const protectedBranches = opts.protectedBranches ?? ["main", "import/friday-v0.3.4"];
  if (branch === null || protectedBranches.includes(branch)) return "unknown";
  if (branch === opts.ownBranch) return "own";
  if (opts.claimedBranches.includes(branch)) return "live";
  return branch.startsWith("ticket/") ? "orphan" : "unknown";
}

/** Check the default Git stash list at worker startup. */
export function checkStashes(stashText: unknown, opts: StashCheckOptions): StashCheckResult {
  const stashes: StashEntry[] = [];
  if (typeof stashText !== "string") {
    return { ok: false, verdict: "unreadable", stashes, reason: "Git stash list output must be text." };
  }

  const lines = stashText.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();

  let unreadableLine: number | undefined;
  for (const [lineNumber, line] of lines.entries()) {
    const match = stashLine.exec(line);
    const index = Number(match?.[1]);
    if (!match || !Number.isSafeInteger(index)) {
      unreadableLine ??= lineNumber + 1;
      continue;
    }

    const [, , rawBranch, subject = ""] = match;
    // A Git branch name cannot contain ASCII spaces or control characters.
    const branch = rawBranch && !/[\x00-\x20\x7f]/.test(rawBranch) ? rawBranch : null;
    stashes.push({ index, branch, kind: classifyBranch(branch, opts), message: subject.slice(0, messageLimit) });
  }

  if (unreadableLine !== undefined) {
    return { ok: false, verdict: "unreadable", stashes, reason: `Could not read Git stash list line ${unreadableLine}.` };
  }
  if (stashes.some((stash) => stash.kind !== "live")) {
    return { ok: false, verdict: "leftovers", stashes, reason: "The stash list has leftovers to review before starting." };
  }
  return { ok: true, verdict: "clean", stashes, reason: "There are no stash leftovers to review." };
}
