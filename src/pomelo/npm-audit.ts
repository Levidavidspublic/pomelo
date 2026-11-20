type Finding = { name: string; severity: string; direct: boolean; fix: boolean };

type AuditResult = {
  verdict: "go" | "hold" | "unknown";
  reason: string;
  findings: Finding[];
  lower: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownReport(reason: string): AuditResult {
  return { verdict: "unknown", reason, findings: [], lower: 0 };
}

/** Check the packages included in an npm audit report. */
export function npmAuditCheck(jsonText: string): AuditResult {
  let report: unknown;
  try {
    report = JSON.parse(jsonText);
  } catch {
    return unknownReport("The audit report could not be read as JSON.");
  }

  if (!isRecord(report)) return unknownReport("The audit report must be a JSON object.");
  if (Object.hasOwn(report, "error")) return unknownReport("npm reported an audit error.");

  const { vulnerabilities, metadata } = report;
  if (!isRecord(vulnerabilities)) return unknownReport("The audit report needs a vulnerabilities object.");

  const counts = { info: 0, low: 0, moderate: 0 };
  const findings: Finding[] = [];
  const names = Object.keys(vulnerabilities).sort();
  for (const name of names) {
    const entry = vulnerabilities[name];
    if (!name.trim() || !isRecord(entry)) return unknownReport("The audit report has an invalid vulnerability entry.");

    const { severity, isDirect, fixAvailable } = entry;
    if (
      typeof severity !== "string" || !severity.trim() || typeof isDirect !== "boolean"
      || (typeof fixAvailable !== "boolean" && !isRecord(fixAvailable))
    ) {
      return unknownReport("A vulnerability entry has invalid severity, directness or fix information.");
    }

    if (severity === "low" || severity === "moderate" || severity === "info") {
      counts[severity]++;
    } else {
      findings.push({ name, severity, direct: isDirect, fix: fixAvailable !== false });
    }
  }

  const lower = counts.low + counts.moderate;
  if (findings.length > 0) {
    // Stable sorting keeps the package name order within each group.
    findings.sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
    return { verdict: "hold", reason: "Audit findings require Amit's review.", findings, lower };
  }

  if (metadata !== undefined) {
    if (!isRecord(metadata)) return unknownReport("The audit summary must be a JSON object.");

    const reported = metadata.vulnerabilities;
    const observed = { ...counts, high: 0, critical: 0, total: names.length };
    if (reported !== undefined && (!isRecord(reported) || Object.entries(observed).some(([severity, count]) =>
      Object.hasOwn(reported, severity) && reported[severity] !== count))) {
      return unknownReport("The audit summary counts do not match the vulnerability entries.");
    }
  }

  return { verdict: "go", reason: "The audit report has no findings that require a hold.", findings, lower };
}
