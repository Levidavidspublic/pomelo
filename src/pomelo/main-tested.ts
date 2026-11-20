import { mainHealth, type MainCommit, type MainHealthVerdict } from "./main-red.js";
import { skipCiCommits } from "./skip-ci.js";

interface MainTestedCommit extends MainCommit {
  readonly message: string;
}

interface MainTestedResult {
  mayMerge: boolean;
  verdict: MainHealthVerdict;
  reason: string;
  untestedShas: string[];
  firstRedSha: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommitHistory(value: unknown): value is readonly MainTestedCommit[] {
  if (!Array.isArray(value)) return false;

  for (const commit of value) {
    if (!isRecord(commit) || typeof commit.sha !== "string" || typeof commit.message !== "string"
      || (commit.pr !== null && typeof commit.pr !== "number") || !Array.isArray(commit.checks)) {
      return false;
    }
    for (const check of commit.checks) {
      if (!isRecord(check) || (check.conclusion != null && typeof check.conclusion !== "string")) {
        return false;
      }
    }
  }
  return true;
}

/** Decide whether to merge using main's commit history in newest-first order. */
export function mainTested(commits: unknown): MainTestedResult {
  if (!isCommitHistory(commits) || commits.length === 0) {
    return {
      mayMerge: false,
      verdict: "wait",
      reason: "Main needs valid commit and check information before merging.",
      untestedShas: [],
      firstRedSha: null,
    };
  }

  const health = mainHealth(commits);
  const skippedShas = new Set(skipCiCommits(commits).map(({ sha }) => sha));
  const untestedShas: string[] = [];
  for (const commit of commits) {
    if (skippedShas.has(commit.sha)) {
      untestedShas.push(commit.sha);
    } else if (mainHealth([commit]).verdict !== "wait") {
      break;
    }
  }

  const newest = commits[0];
  const newestSkipped = skippedShas.has(newest.sha);
  const verdict = newestSkipped && health.verdict === "go" ? "wait" : health.verdict;
  const reason = newestSkipped && verdict === "wait"
    ? `Main commit ${newest.sha} has a CI skip marker.`
    : health.reason;
  return { mayMerge: verdict === "go", verdict, reason, untestedShas, firstRedSha: health.firstRedSha };
}
