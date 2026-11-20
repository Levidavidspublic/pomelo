type Finding = { setting: string; reason: string };

const rules = [
  {
    setting: "default_workflow_permissions",
    accepted: ["read"],
    reason: "Set the default workflow token to read-only permissions.",
  },
  {
    setting: "can_approve_pull_request_reviews",
    accepted: [false],
    reason: "Disable the ability for workflows to approve pull requests.",
  },
  {
    setting: "allowed_actions",
    accepted: ["selected", "local_only"],
    reason: "Restrict allowed actions to 'selected' or 'local_only'.",
  },
  {
    setting: "enabled",
    accepted: [true],
    reason: "Enable GitHub Actions so the gates can run.",
  },
];

export function checkWorkflowToken(jsonText: string): { ok: boolean; findings: Finding[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, findings: [{ setting: "json", reason: "Actions settings must be valid JSON." }] };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, findings: [{ setting: "json", reason: "Actions settings must be a JSON object." }] };
  }

  const settings = parsed as Record<string, unknown>;
  const findings: Finding[] = [];
  for (const { setting, accepted, reason } of rules) {
    if (!Object.hasOwn(settings, setting)) {
      findings.push({ setting, reason: "This setting is missing." });
    } else if (!accepted.some((value) => value === settings[setting])) {
      findings.push({ setting, reason });
    }
  }

  return { ok: findings.length === 0, findings };
}
