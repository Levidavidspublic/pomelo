const flowIds = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"] as const;
type Flow = (typeof flowIds)[number];

interface FlowReportResult {
  flows: Record<Flow, boolean>;
  missing: string[];
  reasons: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function testIssue(test: unknown): string | undefined {
  if (!isRecord(test)) return "A test entry is invalid.";
  if (test.status === "skipped" || test.expectedStatus === "skipped" ||
    (Array.isArray(test.annotations) && test.annotations.some(
      (annotation) => isRecord(annotation) && (annotation.type === "skip" || annotation.type === "fixme"),
    ))) {
    return "A test was skipped.";
  }
  if (test.status === "flaky") return "A test was marked flaky.";
  if (!Array.isArray(test.results) || test.results.length === 0) return "A test did not run.";
  if (test.results.length > 1) return "A test ran on retry.";

  const [attempt] = test.results;
  if (!isRecord(attempt)) return "A test attempt is invalid.";
  if (attempt.status === "skipped") return "A test was skipped.";
  if (typeof attempt.retry === "number" && attempt.retry > 0) return "A test ran on retry.";
  if (attempt.retry !== undefined && attempt.retry !== 0) return "A test reported an invalid retry number.";
  if (test.status !== "expected" || attempt.status !== "passed") return "A test failed to pass as expected.";
}

/** Read Playwright JSON and check which flows have only first-attempt passes. */
export function flowReport(reportJsonText: unknown): FlowReportResult {
  const flows = { F1: false, F2: false, F3: false, F4: false, F5: false, F6: false, F7: false, F8: false };
  const unreadable = (reason: string) => ({ flows, missing: [...flowIds], reasons: [reason] });
  const invalid = "Invalid Playwright JSON report.";
  if (typeof reportJsonText !== "string") return unreadable(invalid);
  if (reportJsonText.trim() === "") return unreadable("The Playwright JSON report is empty.");

  let report: unknown;
  try {
    report = JSON.parse(reportJsonText);
  } catch {
    return unreadable(invalid);
  }
  if (!isRecord(report) || !Array.isArray(report.suites)) return unreadable(invalid);

  const outcomes = new Map<Flow, string | undefined>();
  let hasTests = false;
  const suites: unknown[] = [...report.suites];
  for (const suite of suites) {
    if (!isRecord(suite)) return unreadable(invalid);
    if (suite.suites !== undefined) {
      if (!Array.isArray(suite.suites)) return unreadable(invalid);
      for (const child of suite.suites) suites.push(child);
    }
    if (suite.specs === undefined) continue;
    if (!Array.isArray(suite.specs)) return unreadable(invalid);
    for (const spec of suite.specs) {
      if (!isRecord(spec) || typeof spec.title !== "string" || !Array.isArray(spec.tests)) {
        return unreadable(invalid);
      }
      if (spec.tests.length === 0) continue;
      hasTests = true;

      const { title } = spec;
      const flow = flowIds.find((id) => title.startsWith(`${id}:`) || title.startsWith(`[${id}]`));
      if (!flow || outcomes.get(flow) !== undefined) continue;
      for (const test of spec.tests) {
        const issue = testIssue(test);
        outcomes.set(flow, issue);
        if (issue !== undefined) break;
      }
    }
  }
  if (!hasTests) return unreadable("The Playwright report contains no tests.");

  const missing: string[] = [];
  const reasons: string[] = [];
  for (const flow of flowIds) {
    const issue = outcomes.has(flow) ? outcomes.get(flow) : "No tests found.";
    flows[flow] = issue === undefined;
    if (issue !== undefined) {
      missing.push(flow);
      reasons.push(`${flow}: ${issue}`);
    }
  }
  return { flows, missing, reasons };
}
