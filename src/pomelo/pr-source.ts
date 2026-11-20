export interface PrSourceRules {
  allowedAuthors: readonly string[];
  branchPrefix?: string;
}

export interface PrSourceResult {
  decision: "go" | "amit";
  reasons: string[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Check the source repository, author and head branch in a GitHub PR snapshot. */
export function checkPrSource(prJsonText: string, rules: PrSourceRules): PrSourceResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(prJsonText);
  } catch {
    return { decision: "amit", reasons: ["The PR text is not valid JSON."] };
  }

  const pr = asRecord(parsed);
  if (!pr) {
    return { decision: "amit", reasons: ["The PR JSON must be an object."] };
  }

  const head = asRecord(pr.head);
  const headRepo = asNonEmptyString(asRecord(head?.repo)?.full_name);
  const baseRepo = asNonEmptyString(asRecord(asRecord(pr.base)?.repo)?.full_name);
  const login = asNonEmptyString(asRecord(pr.user)?.login);
  const branch = asNonEmptyString(head?.ref);
  const branchPrefix = rules.branchPrefix ?? "ticket/";
  const reasons: string[] = [];

  if (!headRepo) {
    reasons.push("The head repository name is missing or invalid.");
  }
  if (!baseRepo) {
    reasons.push("The base repository name is missing or invalid.");
  }
  if (headRepo && baseRepo && headRepo.toLowerCase() !== baseRepo.toLowerCase()) {
    reasons.push(`Head repository ${JSON.stringify(headRepo)} differs from base repository ${JSON.stringify(baseRepo)}.`);
  }

  if (!login) {
    reasons.push("The author login is missing or invalid.");
  } else {
    const author = login.toLowerCase();
    if (!rules.allowedAuthors.some((allowed) => allowed.toLowerCase() === author)) {
      reasons.push(`Author login ${JSON.stringify(login)} is outside the allowed list.`);
    }
  }

  if (!branch) {
    reasons.push("The head branch is missing or invalid.");
  } else if (!branch.startsWith(branchPrefix)) {
    reasons.push(`Head branch ${JSON.stringify(branch)} must start with ${JSON.stringify(branchPrefix)}.`);
  }

  return { decision: reasons.length === 0 ? "go" : "amit", reasons };
}
