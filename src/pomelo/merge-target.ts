export function mergeTarget({ base, head, paths }: {
  base: unknown;
  head: unknown;
  paths: readonly string[];
}): { verdict: "auto" | "amit" | "refuse"; reason: string } {
  const baseBranch = typeof base === "string" ? base.replace(/^refs\/heads\//, "") : "";
  const headBranch = typeof head === "string" ? head.replace(/^refs\/heads\//, "") : "";

  if (!baseBranch || !headBranch) {
    return { verdict: "refuse", reason: "Base and head must be non-empty branch names." };
  }
  if (headBranch === "main") {
    return { verdict: "refuse", reason: "Main cannot be the head branch." };
  }
  if (headBranch === baseBranch) {
    return { verdict: "refuse", reason: "Base and head must be different branches." };
  }
  if (paths.length === 0) {
    return { verdict: "refuse", reason: "There are no changed paths to merge." };
  }

  let configPath: string | undefined;
  for (const path of paths) {
    const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").toLowerCase();
    if (normalized.startsWith("/") || /^[a-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
      return {
        verdict: "refuse",
        reason: `Changed path ${JSON.stringify(path)} must be relative and contain no '..' segment.`,
      };
    }
    if (normalized === ".github" || normalized.startsWith(".github/")) {
      configPath ??= path;
    }
  }

  if (configPath !== undefined) {
    return { verdict: "amit", reason: `Config path ${JSON.stringify(configPath)} needs Amit's approval.` };
  }
  if (baseBranch !== "main") {
    return { verdict: "amit", reason: "A base branch other than main needs Amit's approval." };
  }
  if (!/^ticket\/\d+-[a-z0-9-]+$/.test(headBranch)) {
    return { verdict: "amit", reason: "A head branch outside the ticket format needs Amit's approval." };
  }

  return { verdict: "auto", reason: "A ticket branch can auto-merge into main." };
}
