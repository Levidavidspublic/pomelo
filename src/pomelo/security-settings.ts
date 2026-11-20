export const REQUIRED_SECURITY_SETTINGS = Object.freeze([
  "secret_scanning",
  "secret_scanning_push_protection",
  "dependabot_security_updates",
] as const);

const PRIVATE_VULNERABILITY_REPORTING = "private_vulnerability_reporting";

type Finding = { setting: string; problem: "off" | "missing" | "unreadable" };

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

function result(findings: Finding[]) {
  return { ok: findings.length === 0, findings: Object.freeze(findings) };
}

export function checkSecuritySettings(jsonText: string): { ok: boolean; findings: readonly Finding[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return result([{ setting: "json", problem: "unreadable" }]);
  }

  const repository = asObject(parsed);
  if (!repository) {
    return result([{ setting: "json", problem: "unreadable" }]);
  }
  if (!Object.hasOwn(repository, "security_and_analysis")) {
    return result([{ setting: "settings_missing", problem: "missing" }]);
  }

  const security = asObject(repository.security_and_analysis);
  if (!security) {
    return result([{ setting: "security_and_analysis", problem: "unreadable" }]);
  }

  const settings = Object.hasOwn(security, PRIVATE_VULNERABILITY_REPORTING)
    ? [...REQUIRED_SECURITY_SETTINGS, PRIVATE_VULNERABILITY_REPORTING]
    : REQUIRED_SECURITY_SETTINGS;
  const findings: Finding[] = [];
  for (const setting of settings) {
    const entry = Object.hasOwn(security, setting) ? asObject(security[setting]) : undefined;
    if (!entry || !Object.hasOwn(entry, "status") || entry.status !== "enabled") {
      findings.push({ setting, problem: "off" });
    }
  }
  return result(findings);
}
