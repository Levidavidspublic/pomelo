interface SmokeReportReason {
  code: string;
  title?: string;
  message: string;
}

interface SmokeReportResult {
  verdict: "pass" | "fail" | "not-counted";
  reasons: SmokeReportReason[];
  counts: { passed: number; failed: number; flaky: number; skipped: number };
}

const testIssues = {
  skipped: { count: "skipped", code: "skipped", message: "was skipped or marked fixme." },
  failed: { count: "failed", code: "failed", message: "failed." },
  timedOut: { count: "failed", code: "timed-out", message: "timed out." },
  interrupted: { count: "failed", code: "interrupted", message: "was interrupted." },
  flaky: { count: "flaky", code: "flaky", message: "passed on a retry." },
} as const;

type TestOutcome = "passed" | keyof typeof testIssues;
type AttemptStatus = Exclude<TestOutcome, "flaky">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function emptyCounts(): SmokeReportResult["counts"] {
  return { passed: 0, failed: 0, flaky: 0, skipped: 0 };
}

function invalidReport(): SmokeReportResult {
  return {
    verdict: "not-counted",
    reasons: [{ code: "invalid-report", message: "This is not a readable Playwright JSON report." }],
    counts: emptyCounts(),
  };
}

function displayTitle(title: string): string {
  return title.length > 120 ? `${title.slice(0, 119)}…` : title;
}

function readTestOutcome(test: unknown): TestOutcome | undefined {
  if (!isRecord(test) || !Array.isArray(test.results)) return;

  // Playwright emits attempts in retry order. A test with no attempt did not run.
  let lastStatus: AttemptStatus = "skipped";
  let retried = test.results.length > 1;
  for (const result of test.results) {
    if (!isRecord(result)) return;
    const { status, retry } = result;
    if (status !== "passed" && status !== "failed" && status !== "timedOut"
      && status !== "skipped" && status !== "interrupted") return;
    if (retry !== undefined && !isCount(retry)) return;
    if (retry) retried = true;
    lastStatus = status;
  }

  if (test.expectedStatus === "skipped" || (Array.isArray(test.annotations) && test.annotations.some(
    (annotation) => isRecord(annotation) && annotation.type === "fixme",
  ))) {
    return "skipped";
  }
  return lastStatus === "passed" && retried ? "flaky" : lastStatus;
}

/** Check the test attempts in a parsed Playwright JSON report. */
export function checkSmokeReport(
  report: unknown,
  opts?: { requiredTitles?: string[] },
): SmokeReportResult {
  try {
    if (!isRecord(report) || !Array.isArray(report.suites) || !isRecord(report.stats)) return invalidReport();
    const { expected, unexpected, flaky, skipped } = report.stats;
    if (![expected, unexpected, flaky, skipped].every(isCount)) return invalidReport();
    if (report.errors !== undefined && !Array.isArray(report.errors)) return invalidReport();

    const counts = emptyCounts();
    const reasons: SmokeReportReason[] = [];
    const titles = new Set<string>();
    const suites: unknown[] = [...report.suites];
    const seen = new Set<object>();
    for (const suite of suites) {
      if (!isRecord(suite) || !Array.isArray(suite.specs) || seen.has(suite)) return invalidReport();
      seen.add(suite);
      if (suite.suites !== undefined) {
        if (!Array.isArray(suite.suites)) return invalidReport();
        for (const child of suite.suites) suites.push(child);
      }

      for (const spec of suite.specs) {
        if (!isRecord(spec) || typeof spec.title !== "string" || !Array.isArray(spec.tests)) return invalidReport();
        const { title } = spec;
        for (const test of spec.tests) {
          const outcome = readTestOutcome(test);
          if (outcome === undefined) return invalidReport();
          titles.add(title);
          if (outcome === "passed") {
            counts.passed++;
          } else {
            const issue = testIssues[outcome];
            counts[issue.count]++;
            reasons.push({ code: issue.code, title, message: `Test "${displayTitle(title)}" ${issue.message}` });
          }
        }
      }
    }

    for (const title of new Set(opts?.requiredTitles)) {
      if (!titles.has(title)) {
        reasons.push({
          code: "missing-required-title",
          title,
          message: `Required test "${displayTitle(title)}" is missing.`,
        });
      }
    }
    const hasRunnerErrors = Array.isArray(report.errors) && report.errors.length > 0;
    if (hasRunnerErrors) {
      reasons.push({ code: "runner-error", message: "Playwright reported an error outside a test." });
    }

    const failed = hasRunnerErrors || (titles.size > 0 && reasons.length > 0);
    if (titles.size === 0) reasons.push({ code: "no-tests", message: "No smoke tests ran." });
    if (expected !== counts.passed || unexpected !== counts.failed || flaky !== counts.flaky || skipped !== counts.skipped) {
      reasons.push({
        code: "stats-mismatch",
        message: "Playwright's stats disagree with the counts from individual smoke tests.",
      });
    }

    if (failed) return { verdict: "fail", reasons, counts };
    if (reasons.length > 0) return { verdict: "not-counted", reasons, counts };
    return { verdict: "pass", reasons, counts };
  } catch {
    // Unknown input can contain properties that throw when read.
    return invalidReport();
  }
}
