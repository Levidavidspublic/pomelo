export interface BranchFreshInput {
  currentBaseCommit?: string;
  testedBaseCommit?: string;
  behindBy: number;
  testedBaseInHistory: boolean;
  baseChangedFiles: readonly string[];
  prChangedFiles: readonly string[];
}

export interface BranchFreshResult {
  action: "merge" | "update-first" | "ask-amit";
  reason: string;
  sharedFiles: string[];
  riskyFiles: string[];
}

const riskyBaseFiles = new Set(["package.json", "package-lock.json", "tsconfig.json", "scripts/test.mjs"]);

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function branchFresh(input: BranchFreshInput): BranchFreshResult {
  const { currentBaseCommit, testedBaseCommit, behindBy, testedBaseInHistory } = input;
  const emptyFiles = { sharedFiles: [], riskyFiles: [] };

  if (typeof currentBaseCommit !== "string" || !currentBaseCommit.trim() ||
      typeof testedBaseCommit !== "string" || !testedBaseCommit.trim()) {
    return { action: "ask-amit", reason: "Both the current and tested base commit IDs are required.", ...emptyFiles };
  }
  if (!Number.isInteger(behindBy) || behindBy < 0) {
    return { action: "ask-amit", reason: "The behind count must be a non-negative whole number.", ...emptyFiles };
  }
  if (testedBaseInHistory !== true) {
    return { action: "ask-amit", reason: "The tested commit must be in the base branch's history.", ...emptyFiles };
  }
  if (behindBy === 0 && testedBaseCommit === currentBaseCommit) {
    return { action: "merge", reason: "The checks ran against the current base commit.", ...emptyFiles };
  }

  const baseFiles = [...new Set(input.baseChangedFiles.map(normalizePath))].sort();
  const prFiles = new Set(input.prChangedFiles.map(normalizePath));
  const sharedFiles = baseFiles.filter((file) => prFiles.has(file));
  const riskyFiles = baseFiles.filter((file) => riskyBaseFiles.has(file));

  const reasons = [behindBy === 0
    ? "The checks ran against an older base commit. Rerun checks against the current base."
    : `The PR is behind the base by ${behindBy} ${behindBy === 1 ? "commit" : "commits"}. Update the branch and rerun checks.`];
  if (sharedFiles.length > 0) {
    reasons.push(`The base and PR both changed ${sharedFiles.join(", ")}.`);
  }
  if (riskyFiles.length > 0) {
    reasons.push(`The base changed build or test files ${riskyFiles.join(", ")}.`);
  }

  return { action: "update-first", reason: reasons.join(" "), sharedFiles, riskyFiles };
}
