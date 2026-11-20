import { stripVTControlCharacters } from "node:util";

type TestName = { file?: string; name: string };
type Outcome = "pass" | "fail" | "other";
type TestsByFile = Map<string | undefined, Set<Outcome>>;
type RunVerdict = { verdict: "green" | "red" | "flaky" | "unknown"; flaky: TestName[]; reason: string };

const FILE_PATH = /^(?:\S*\/)?[^\s/]+\.test\.[cm]?[jt]sx?$/;
const RUNNER_HEADER = /^> node scripts\/test\.mjs (\S+)$/;
const GROUP_START = /^(\s*)(?:▶ |# Subtest: )(.+)$/;
const SPEC_RESULT = /^(\s*)([✔✖﹣⚠]) (.+) \(\d+(?:\.\d+)?(?:e[+-]?\d+)?(?:ms|s)\)(?: \(passed on attempt \d+\))?( # .*)?$/;
const TAP_RESULT = /^(\s*)(ok|not ok) \d+ - (.+?)( # (?:TODO|SKIP|EXPECTED FAILURE)\b.*)?$/i;
const COUNT = /^(?:ℹ|#) (tests|pass|fail|cancelled|skipped|todo) (\d+)$/;

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function testFile(title: string): string | undefined {
  const path = normalizePath(title);
  if (FILE_PATH.test(path)) return path;
}

function readSpecFailureFiles(lines: string[], footer: number): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  if (footer < 0) return paths;

  // The footer repeats failed results and adds their source locations.
  for (let index = lines.length - 2; index > footer; index--) {
    const location = /^test at (.+):\d+:\d+$/.exec(lines[index]);
    const result = lines[index + 1];
    if (!location || !result.startsWith("✖ ")) continue;
    const files = paths.get(result) ?? [];
    files.push(normalizePath(location[1]));
    paths.set(result, files);
  }
  return paths;
}

function readRun(output: string) {
  const lines = stripVTControlCharacters(output).split(/\r?\n/).map((line) => line.trimEnd());
  const footer = lines.indexOf("✖ failing tests:");
  const failureFiles = readSpecFailureFiles(lines, footer);
  const tests = new Map<string, TestsByFile>();
  const counts = new Map<string, number>();
  let singleFile: string | undefined;
  let group: { file: string; depth: number; hasTests: boolean } | undefined;
  let allPassed = true;

  for (let index = 0; index < lines.length && index !== footer; index++) {
    const line = lines[index];
    const count = COUNT.exec(line);
    if (count) counts.set(count[1], Number(count[2]));

    const header = RUNNER_HEADER.exec(line);
    if (header) singleFile = testFile(header[1]);

    const start = GROUP_START.exec(line);
    if (start) {
      const depth = start[1].length;
      if (group && depth <= group.depth) group = undefined;
      const file = testFile(start[2]);
      if (file) group = { file, depth, hasTests: false };
      continue;
    }

    const spec = SPEC_RESULT.exec(line);
    const result = spec ?? TAP_RESULT.exec(line);
    if (!result) continue;

    const [, indent, symbol, title, directive] = result;
    let file: string | undefined;
    let suite = false;
    if (spec) {
      file = failureFiles.get(line.trimStart())?.pop();
    } else if (lines[index + 1] === `${indent}  ---`) {
      const prefix = `${indent}  `;
      while (lines[index + 1]?.startsWith(prefix)) {
        const detail = lines[++index].slice(prefix.length);
        if (detail === "...") break;
        const location = /^location: (['"]?)(.+):\d+:\d+\1$/.exec(detail);
        if (location) file = normalizePath(location[2].replaceAll("\\\\", "\\"));
        if (/^type: ['"]?suite['"]?$/.test(detail)) suite = true;
      }
    }

    const outcome: Outcome = directive || symbol === "﹣" || symbol === "⚠" ? "other"
      : symbol === "✔" || symbol.toLowerCase() === "ok" ? "pass" : "fail";
    const name = spec ? title : title.replace(/\\([\\#])/g, "$1");
    const namedFile = testFile(name);
    if (group && indent.length <= group.depth) {
      const wrapsTests = group.hasTests && namedFile === group.file;
      group = undefined;
      if (wrapsTests) {
        allPassed &&= outcome === "pass";
        continue;
      }
    }
    if (suite) continue;
    if (group) group.hasTests = true;

    allPassed &&= outcome === "pass";
    file = namedFile ?? group?.file ?? singleFile ?? file;
    const byFile: TestsByFile = tests.get(name) ?? new Map();
    const outcomes = byFile.get(file) ?? new Set<Outcome>();
    outcomes.add(outcome);
    byFile.set(file, outcomes);
    tests.set(name, byFile);
  }

  const total = counts.get("tests");
  const pass = counts.get("pass");
  allPassed &&= total === undefined || pass === undefined || pass === total;
  allPassed &&= ["fail", "cancelled", "skipped", "todo"].every((kind) => !counts.get(kind));
  return { tests, hasTests: tests.size > 0 && total !== 0, allPassed };
}

function compareNames(a: TestName, b: TestName): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  const firstFile = a.file ?? "";
  const secondFile = b.file ?? "";
  return firstFile === secondFile ? 0 : firstFile < secondFile ? -1 : 1;
}

/** Compare reported results from two captures of the same test command. */
export function rerunVerdict({ firstOutput, secondOutput, firstSha, secondSha }: {
  firstOutput: string;
  secondOutput: string;
  firstSha: string;
  secondSha: string;
}): RunVerdict {
  if (!firstSha.trim() || !secondSha.trim() || firstSha !== secondSha) {
    return { verdict: "unknown", flaky: [], reason: "Both runs must identify the same commit." };
  }

  const first = readRun(firstOutput);
  const second = readRun(secondOutput);
  if (!first.hasTests || !second.hasTests) {
    return { verdict: "unknown", flaky: [], reason: "Both runs must report at least one named test." };
  }

  const flaky: TestName[] = [];
  let repeatedFailure = false;
  for (const name of new Set([...first.tests.keys(), ...second.tests.keys()])) {
    const firstFiles: TestsByFile = first.tests.get(name) ?? new Map();
    const secondFiles: TestsByFile = second.tests.get(name) ?? new Map();
    const compare = (file: string | undefined, before: Set<Outcome>, after: Set<Outcome>) => {
      const passedBefore = before.has("pass");
      const passedAfter = after.has("pass");
      const failedBefore = before.has("fail");
      const failedAfter = after.has("fail");
      repeatedFailure ||= failedBefore && failedAfter;
      const changed = passedBefore !== passedAfter || failedBefore !== failedAfter;
      if (changed && ((passedBefore && failedAfter) || (failedBefore && passedAfter))) {
        flaky.push({ name, ...(file ? { file } : {}) });
      }
    };

    const firstOnly = [...firstFiles.keys()].filter((file) => !secondFiles.has(file));
    const secondOnly = [...secondFiles.keys()].filter((file) => !firstFiles.has(file));
    for (const [file, before] of firstFiles) {
      const after = secondFiles.get(file);
      if (after) compare(file, before, after);
    }

    // A reporter can include the file only for a failed result.
    if (firstOnly.length === 1 && secondOnly.length === 1 &&
        (firstOnly[0] === undefined || secondOnly[0] === undefined)) {
      compare(firstOnly[0] ?? secondOnly[0], firstFiles.get(firstOnly[0])!, secondFiles.get(secondOnly[0])!);
    } else {
      for (const file of [...firstOnly, ...secondOnly]) {
        flaky.push({ name, ...(file ? { file } : {}) });
      }
    }
  }

  if (flaky.length) {
    return { verdict: "flaky", flaky: flaky.sort(compareNames), reason: "Some tests changed outcome or appeared in only one run." };
  }
  if (repeatedFailure) return { verdict: "red", flaky, reason: "At least one test failed in both runs." };
  if (first.allPassed && second.allPassed) return { verdict: "green", flaky, reason: "Every test passed in both runs." };
  return { verdict: "unknown", flaky, reason: "The reported results do not establish that every test passed." };
}
