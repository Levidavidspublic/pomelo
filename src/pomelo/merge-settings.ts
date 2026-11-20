type Problem = { code: string; field: string; reason: string };

const rules = [
  {
    field: "allow_merge_commit",
    expected: false,
    code: "merge-commit-allowed",
    reason: "Turn off merge commits so each ticket lands as one commit.",
  },
  {
    field: "allow_rebase_merge",
    expected: false,
    code: "rebase-merge-allowed",
    reason: "Turn off rebase merges so each ticket lands as one commit.",
  },
  {
    field: "allow_squash_merge",
    expected: true,
    code: "squash-off",
    reason: "Turn on squash merging so each ticket lands as one commit.",
  },
  {
    field: "allow_auto_merge",
    expected: true,
    code: "auto-merge-off",
    reason: "Turn on auto-merge so ready tickets can merge automatically.",
  },
  {
    field: "delete_branch_on_merge",
    expected: true,
    code: "branch-not-deleted",
    reason: "Turn on automatic deletion of merged branches.",
  },
  {
    field: "default_branch",
    expected: "main",
    code: "default-branch-not-main",
    reason: "Set the default branch to main.",
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
    } else if (settings[field] !== expected) {
      problems.push({ code, field, reason });
    }
  }

  return { ok: problems.length === 0, problems };
}
