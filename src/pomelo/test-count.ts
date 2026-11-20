import { stripVTControlCharacters } from "node:util";

type TestSummary = {
  tests: number;
  pass: number;
  fail: number;
  cancelled: number;
  skipped: number;
  todo: number;
};

const SUMMARY_COUNT = /^(#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)$/;

export function readTestSummary(text: string): TestSummary | undefined {
  let reporter: string | undefined;
  let counts: Partial<TestSummary> = {};

  for (const line of stripVTControlCharacters(text).split(/\r?\n/)) {
    const match = SUMMARY_COUNT.exec(line.trimEnd());
    if (!match) continue;

    const [, prefix, field, digits] = match;
    if (field === "tests") {
      reporter = prefix;
      counts = {};
    }
    if (prefix !== reporter) continue;

    const key = field as keyof TestSummary;
    const count = Number(digits);
    if (Number.isSafeInteger(count) && counts[key] === undefined) counts[key] = count;
  }

  const { tests, pass, fail, cancelled, skipped, todo } = counts;
  if (tests === undefined || pass === undefined || fail === undefined ||
      cancelled === undefined || skipped === undefined || todo === undefined) {
    return undefined;
  }
  return { tests, pass, fail, cancelled, skipped, todo };
}

export function compareTestCounts(baseText: string, prText: string) {
  const base = readTestSummary(baseText);
  const pr = readTestSummary(prText);
  const problems: string[] = [];

  if (!base) problems.push("Could not find a complete base test summary.");
  if (!pr) problems.push("Could not find a complete PR test summary.");
  if (!base || !pr) return { ok: false, base, pr, problems };

  if (pr.fail > 0) problems.push(`The PR failure count is ${pr.fail} (base ${base.fail}).`);
  if (pr.cancelled > 0) problems.push(`The PR cancellation count is ${pr.cancelled} (base ${base.cancelled}).`);
  if (pr.tests < base.tests) problems.push(`The test count fell from ${base.tests} to ${pr.tests}.`);
  if (pr.pass < base.pass) problems.push(`The pass count fell from ${base.pass} to ${pr.pass}.`);
  if (pr.skipped > base.skipped) problems.push(`The skipped count rose from ${base.skipped} to ${pr.skipped}.`);
  if (pr.todo > base.todo) problems.push(`The todo count rose from ${base.todo} to ${pr.todo}.`);

  return { ok: problems.length === 0, base, pr, problems };
}
