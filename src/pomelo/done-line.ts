import { stripVTControlCharacters } from "node:util";

const TEST_COMMAND = /^npm test -- (test\/[\w.+-]+\.test\.ts)( && npm run typecheck)?$/;
const TYPECHECK_SUFFIX = " && npm run typecheck";
const TEST_PATH = /^(?:\.\/)?(test\/[\w.+-]+\.test\.ts)$/;
const TAP_RESULT = /^(ok|not ok) \d+ - (.+?)(?: # (TODO|SKIP)\b.*)?$/;
const SPEC_RESULT = /^([✔✖]) (.+) \(\d+(?:\.\d+)?ms\)$/;
const RUNNER_HEADER = /^> node scripts\/test\.mjs (.+)$/;
const RUN_COUNT = /^(?:#|ℹ) (tests|pass|fail) (\d+)$/;
const MISSING_FILE = /^Could not find ['"](?:\.\/)?(test\/[\w.+-]+\.test\.ts)['"]\.?$/;

export function parseDoneLine(doneLine: string): { testPath: string; expected: string; requiresTypecheck: boolean } | undefined {
  const parts = /^(.+?) -> (.+)$/.exec(doneLine.trim());
  if (!parts) return;

  const command = TEST_COMMAND.exec(parts[1].replace(/^`([^`]+)`$/, "$1"));
  if (!command) return;

  const [, testPath, commandTypecheck] = command;
  const expectedTypecheck = parts[2].endsWith(TYPECHECK_SUFFIX);
  if (commandTypecheck && expectedTypecheck) return;

  const expected = (expectedTypecheck ? parts[2].slice(0, -TYPECHECK_SUFFIX.length) : parts[2]).trim();
  if (!expected || /&&|;|\bnpm\s+test\b|\btest\/[^\s`]+\.test\.ts\b/.test(expected)) return;

  return { testPath, expected, requiresTypecheck: Boolean(commandTypecheck) || expectedTypecheck };
}

export function readRunSummary(output: string): {
  tests: number | undefined;
  pass: number | undefined;
  fail: number | undefined;
  failedTest: boolean;
  testFiles: string[];
  missingFiles: string[];
} {
  let tests: number | undefined;
  let pass: number | undefined;
  let fail: number | undefined;
  let failedTest = false;
  const testFiles = new Set<string>();
  const missingFiles = new Set<string>();

  for (const rawLine of stripVTControlCharacters(output).split(/\r?\n/)) {
    const line = rawLine.trimEnd().replaceAll("\\", "/");
    const count = RUN_COUNT.exec(line);
    if (count) {
      const value = Number(count[2]);
      if (count[1] === "tests") {
        tests = value;
        pass = undefined;
        // A later summary cannot clear a failure already in the capture.
        if (!fail) fail = undefined;
      } else if (count[1] === "pass") {
        pass = value;
      } else {
        fail = Math.max(fail ?? 0, value);
      }
      continue;
    }

    const missing = MISSING_FILE.exec(line);
    if (missing) missingFiles.add(missing[1]);

    const result = TAP_RESULT.exec(line) ?? SPEC_RESULT.exec(line);
    if (result) {
      const path = TEST_PATH.exec(result[2]);
      if (path) testFiles.add(path[1]);
      if (!result[3] && (result[1] === "not ok" || result[1] === "✖")) failedTest = true;
    }

    // Node can print assertion titles without filenames. npm echoes the paths it passed to Friday's runner.
    const header = RUNNER_HEADER.exec(line);
    for (const argument of header?.[1].split(/\s+/) ?? []) {
      const path = TEST_PATH.exec(argument);
      if (path) testFiles.add(path[1]);
    }
  }

  return { tests, pass, fail, failedTest, testFiles: [...testFiles], missingFiles: [...missingFiles] };
}

export function doneLineCheck({ doneLine, exitCode, output }: {
  doneLine: string;
  exitCode?: number | null;
  output: string;
}): { verdict: "pass" | "fail" | "not-run"; reasons: string[] } {
  const done = parseDoneLine(doneLine);
  if (!done) {
    return { verdict: "fail", reasons: ["DONE must name one npm test command and its expected result, with an optional npm run typecheck."] };
  }

  const summary = readRunSummary(output);
  if (summary.fail) {
    const reason = summary.fail === 1 ? "1 test failed." : `${summary.fail} tests failed.`;
    return { verdict: "fail", reasons: [reason] };
  }
  if (summary.failedTest) {
    return { verdict: "fail", reasons: ["A test failed."] };
  }
  if (summary.missingFiles.includes(done.testPath)) {
    return { verdict: "not-run", reasons: [`Could not find the requested test file ${done.testPath}.`] };
  }
  if (exitCode != null && exitCode !== 0) {
    return { verdict: "fail", reasons: [`The DONE command returned exit code ${exitCode}.`] };
  }
  if (summary.tests === 0 || summary.pass === 0) {
    return { verdict: "not-run", reasons: ["No tests ran."] };
  }
  if (summary.testFiles.some((path) => path !== done.testPath)) {
    return { verdict: "not-run", reasons: [`The output shows a different test file from ${done.testPath}.`] };
  }
  if (!summary.testFiles.includes(done.testPath)) {
    return { verdict: "not-run", reasons: [`The output does not show the requested test file ${done.testPath}.`] };
  }
  if (summary.tests === undefined || summary.fail !== 0) {
    return { verdict: "not-run", reasons: ["The output is missing the test or failure count."] };
  }
  if (exitCode !== 0) {
    return { verdict: "not-run", reasons: ["The DONE command's exit code is missing."] };
  }

  return { verdict: "pass", reasons: done.requiresTypecheck ? ["Typecheck is required by the DONE line."] : [] };
}
