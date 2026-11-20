export type GitLockKind = "index" | "ref" | "head" | "config" | "shallow" | "packed-refs" | "worktree" | "other";

export interface GitLock {
  path: string;
  ageSeconds: number;
  kind: GitLockKind;
  stale: boolean;
}

export interface GitLocksOptions {
  readonly nowSeconds: number;
  /** Whether the caller saw a live Git command in its process snapshot. */
  readonly gitRunning: boolean;
  /** Locks must exceed this age in seconds. Defaults to 600. */
  readonly staleAfterSeconds?: number;
}

export interface GitLocksResult {
  verdict: "go" | "wait" | "clean" | "stop";
  locks: GitLock[];
  reason: string;
}

function lockKind(path: string): GitLockKind {
  if (path.startsWith(".git/refs/")) return "ref";
  if (path.startsWith(".git/worktrees/")) return "worktree";

  switch (path) {
    case ".git/index.lock": return "index";
    case ".git/HEAD.lock": return "head";
    case ".git/config.lock": return "config";
    case ".git/shallow.lock": return "shallow";
    case ".git/packed-refs.lock": return "packed-refs";
    default: return "other";
  }
}

/** Check a lock listing against the caller's time and Git process snapshot. */
export function gitLocks(findText: string, { nowSeconds, gitRunning, staleAfterSeconds = 600 }: GitLocksOptions): GitLocksResult {
  const unreadable: GitLocksResult = { verdict: "stop", locks: [], reason: "unreadable" };
  if (!Number.isFinite(nowSeconds) || nowSeconds < 0) return unreadable;

  const listing = findText.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!listing) return { verdict: "go", locks: [], reason: "No Git locks found." };

  const locks: GitLock[] = [];
  for (const line of listing.split("\n")) {
    const match = /^(-?\d+(?:\.\d+)?) ([^\0\r]+)$/.exec(line);
    if (!match) return unreadable;

    const [, timestamp, path] = match;
    const age = nowSeconds - Number(timestamp);
    if (!Number.isFinite(age) || age < -60) return unreadable;

    const eligible = path.startsWith(".git/") && path.endsWith(".lock") && !path.includes("..");
    const ageSeconds = Math.max(0, age);
    locks.push({
      path,
      ageSeconds,
      kind: eligible ? lockKind(path) : "other",
      stale: eligible && !gitRunning && staleAfterSeconds >= 0 && ageSeconds > staleAfterSeconds,
    });
  }

  if (gitRunning) return { verdict: "wait", locks, reason: "A Git command is running." };
  if (locks.some((lock) => lock.stale)) return { verdict: "clean", locks, reason: "Clean up the locks marked stale first." };
  return { verdict: "wait", locks, reason: "Git locks remain and none are eligible for cleanup." };
}
