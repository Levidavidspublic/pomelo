type Problem = { code: string; field: string; reason: string };

const rules = [
  {
    field: "allow_merge_commit",
    expected: false,
    code: "merge-commit-allowed",
    reason: "Merge commits are allowed, so turn them off to keep each ticket to one commit.",
  },
  {
    field: "allow_rebase_merge",
    expected: false,
    code: "rebase-merge-allowed",
    reason: "Rebase merges are allowed, so turn them off to keep each ticket to one commit.",
  },
  {
    field: "allow_squash_merge",
    expected: true,
    code: "squash-off",
    reason: "Squash merging is off, so turn it on to land each ticket as one commit.",
  },
  {
    field: "allow_auto_merge",
    expected: true,
    code: "auto-merge-off",
    reason: "Auto-merge is off, so turn it on to let ready tickets merge automatically.",
  },
  {
    field: "delete_branch_on_merge",
    expected: true,
    code: "branch-not-deleted",
    reason: "Automatic branch deletion is off, so turn it on to remove merged branches.",
  },
  {
    field: "default_branch",
    expected: "main",
    code: "default-branch-not-main",
    reason: "The default branch differs from main, so set it to main.",
  },
];

export function checkMergeSettings(jsonText: string): { ok: boolean; problems: Problem[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, problems: [{ code: "unreadable", field: "json", reason: "Provide valid repository settings JSON." }] };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, problems: [{ code: "unreadable", field: "json", reason: "Provide repository settings as a JSON object." }] };
  }

  const settings = parsed as Record<string, unknown>;
  const problems: Problem[] = [];
  for (const { field, expected, code, reason } of rules) {
    if (!Object.hasOwn(settings, field)) {
      problems.push({ code: "field-missing", field, reason: `Include ${field} in the repository settings JSON.` });
      continue;
    }

    const value = settings[field];
    if (typeof value !== typeof expected) {
      problems.push({ code, field, reason: `The ${field} value must be the JSON literal ${JSON.stringify(expected)}.` });
    } else if (value !== expected) {
      problems.push({ code, field, reason });
    }
  }

  return { ok: problems.length === 0, problems };
}
