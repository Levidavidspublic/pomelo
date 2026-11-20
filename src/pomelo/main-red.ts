export interface MainCheck {
  /** Use null or omit the conclusion when a required check has no result. */
  readonly conclusion?: string | null;
}

export interface MainCommit {
  readonly sha: string;
  readonly pr: number | null;
  /** Include every required check, using an unset conclusion for a missing result. */
  readonly checks: readonly MainCheck[];
}

export type MainHealthVerdict = "go" | "stop" | "wait";

export interface MainHealthResult {
  verdict: MainHealthVerdict;
  reason: string;
  firstRedSha: string | null;
  firstRedPr: number | null;
}

const reasons: Record<MainHealthVerdict, string> = {
  go: "All required checks on main passed.",
  stop: "A required check on main failed, was cancelled, or timed out.",
  wait: "Main is still waiting for required checks to pass.",
};

function isRed(commit: MainCommit): boolean {
  return commit.checks.some(({ conclusion }) =>
    conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out",
  );
}

/** Decide from main's history in newest-first order. */
export function mainHealth(commits: readonly MainCommit[]): MainHealthResult {
  let oldestRed: MainCommit | undefined;
  for (const commit of commits) {
    if (!isRed(commit)) break;
    oldestRed = commit;
  }

  if (oldestRed) {
    return { verdict: "stop", reason: reasons.stop, firstRedSha: oldestRed.sha, firstRedPr: oldestRed.pr };
  }

  const newest = commits[0];
  const verdict = newest && newest.checks.length > 0 && newest.checks.every(({ conclusion }) => conclusion === "success")
    ? "go"
    : "wait";
  return { verdict, reason: reasons[verdict], firstRedSha: null, firstRedPr: null };
}
