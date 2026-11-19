type Finding = { setting: string; reason: string };

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

export function checkBranchProtection(jsonText: string, requiredChecks: readonly string[]): {
  ok: boolean;
  findings: Finding[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, findings: [{ setting: "json", reason: "Branch protection settings must be valid JSON." }] };
  }

  const protection = asObject(parsed);
  if (!protection) {
    return { ok: false, findings: [{ setting: "json", reason: "Branch protection settings must be a JSON object." }] };
  }
  if (requiredChecks.length === 0) {
    return { ok: false, findings: [{ setting: "requiredChecks", reason: "Provide at least one required check name." }] };
  }

  const findings: Finding[] = [];
  const statusChecks = asObject(protection.required_status_checks);
  if (!statusChecks) {
    findings.push({ setting: "required_status_checks", reason: "Main must require status checks." });
  } else {
    const configuredChecks = new Set<string>();
    if (Array.isArray(statusChecks.contexts)) {
      for (const context of statusChecks.contexts) {
        if (typeof context === "string") configuredChecks.add(context);
      }
    }
    if (Array.isArray(statusChecks.checks)) {
      for (const check of statusChecks.checks) {
        const context = asObject(check)?.context;
        if (typeof context === "string") configuredChecks.add(context);
      }
    }
    for (const name of new Set(requiredChecks)) {
      if (!configuredChecks.has(name)) {
        findings.push({ setting: "required_status_checks", reason: `Required status check ${JSON.stringify(name)} is missing.` });
      }
    }
    if (statusChecks.strict !== true) {
      findings.push({ setting: "required_status_checks.strict", reason: "Branches must be up to date before merging." });
    }
  }

  if (asObject(protection.allow_force_pushes)?.enabled === true) {
    findings.push({ setting: "allow_force_pushes", reason: "Force pushes must be disabled on main." });
  }
  if (asObject(protection.allow_deletions)?.enabled === true) {
    findings.push({ setting: "allow_deletions", reason: "Deletion of main must be disabled." });
  }
  if (asObject(protection.enforce_admins)?.enabled !== true) {
    findings.push({ setting: "enforce_admins", reason: "Branch protection must apply to administrators." });
  }

  return { ok: findings.length === 0, findings };
}
