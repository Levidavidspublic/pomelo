import { stripVTControlCharacters } from "node:util";

export type SlowTestLimits = { testMs?: number; fileMs?: number };
export type SlowTest = { name: string; file?: string; ms: number; limitMs: number };
export type SlowTestResult = { ok: boolean; slow: SlowTest[]; slowestMs: number; reasons: string[] };

const FILE_PATH = /^(?:\S*\/)?[^\s/]+\.test\.[cm]?[jt]sx?$/;
const SPEC_RESULT = /^(\s*)[✔✖﹣⚠] (.+) \((\d+(?:\.\d+)?(?:e[+-]?\d+)?)(ms|s)\)(?: \(passed on attempt \d+\))?(?: # .*)?$/;
const TAP_RESULT = /^(\s*)(?:not )?ok \d+ - (.+?)(?: # (?:TODO|SKIP|EXPECTED FAILURE)\b.*)?$/i;
const GROUP_START = /^(\s*)(?:▶ |# Subtest: )(.+)$/;
const RUNNER_HEADER = /^> node scripts\/test\.mjs (\S+)$/;
const SPEC_FAILURE_LOCATION = /^test at (.+):\d+:\d+$/;
const TAP_DURATION = /^duration_ms: (\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i;
const TAP_LOCATION = /^location: (['"]?)(.+):\d+:\d+\1$/;

type Timing = { depth: number; ms: number };

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function testFile(name: string): string | undefined {
  const path = normalizePath(name);
  return FILE_PATH.test(path) ? path : undefined;
}

function specFailureFiles(lines: string[], footer: number): Map<string, string[]> {
  const files = new Map<string, string[]>();
  if (footer === -1) return files;

  // Read backwards so popping repeated result lines follows the reporter's order.
  for (let index = lines.length - 2; index > footer; index--) {
    const location = SPEC_FAILURE_LOCATION.exec(lines[index]);
    const result = lines[index + 1];
    if (!location || !result.startsWith("✖ ")) continue;
    const matches = files.get(result) ?? [];
    matches.push(normalizePath(location[1]));
    files.set(result, matches);
  }
  return files;
}

function tapDetails(lines: string[], index: number, indent: string) {
  const prefix = `${indent}  `;
  let ms = NaN;
  let file: string | undefined;
  let suite = false;
  for (let next = index + 1; next < lines.length && lines[next].startsWith(prefix); next++) {
    const detail = lines[next].slice(prefix.length);
    if (detail === "...") break;
    const duration = TAP_DURATION.exec(detail);
    if (duration) ms = Number(duration[1]);
    const location = TAP_LOCATION.exec(detail);
    if (location) file = normalizePath(location[2].replaceAll("\\\\", "\\"));
    if (/^type: ['"]?suite['"]?$/.test(detail)) suite = true;
  }
  return { ms, file, suite };
}

function sumTests(timings: Timing[]): number {
  const pending: Timing[] = [];
  for (const timing of timings) {
    let childrenMs = 0;
    // Both reporters print children before their enclosing group's inclusive duration.
    while (pending.length && pending[pending.length - 1].depth > timing.depth) {
      childrenMs += pending[pending.length - 1].ms;
      pending.pop();
    }
    pending.push({ depth: timing.depth, ms: Math.max(timing.ms, childrenMs) });
  }
  return pending.reduce((sum, timing) => sum + timing.ms, 0);
}

/** Check the reported test durations and any file totals that can be identified from the output. */
export function findSlowTests(runOutput: string, { testMs = 2000, fileMs = 20000 }: SlowTestLimits = {}): SlowTestResult {
  const lines = stripVTControlCharacters(runOutput).split(/\r?\n/).map((line) => line.trimEnd());
  const footer = lines.indexOf("✖ failing tests:");
  const failureFiles = specFailureFiles(lines, footer);
  const slow: SlowTest[] = [];
  const files = new Map<string, { reportedMs: number; tests: Timing[] }>();
  let singleFile: string | undefined;
  let group: { file: string; depth: number } | undefined;
  let slowestMs = 0;
  let hasTiming = false;

  for (const [index, line] of lines.entries()) {
    if (index === footer) break; // The spec footer repeats failed results.

    const header = RUNNER_HEADER.exec(line);
    if (header) singleFile = testFile(header[1]);

    const start = GROUP_START.exec(line);
    if (start) {
      const depth = start[1].length;
      if (group && depth <= group.depth) group = undefined;
      const file = testFile(start[2]);
      if (file) group = { file, depth };
      continue;
    }

    const spec = SPEC_RESULT.exec(line);
    const result = spec ?? TAP_RESULT.exec(line);
    if (!result) continue;

    const [, indent, title] = result;
    const depth = indent.length;
    if (group && depth <= group.depth) group = undefined;

    const details = spec
      ? { ms: Number(spec[3]) * (spec[4] === "s" ? 1000 : 1), file: undefined, suite: false }
      : tapDetails(lines, index, indent);
    const { ms } = details;
    if (!Number.isFinite(ms)) continue;

    hasTiming = true;
    slowestMs = Math.max(slowestMs, ms);
    const name = spec ? title : title.replace(/\\([\\#])/g, "$1");
    const reportedFile = testFile(name);
    const failureFile = spec ? failureFiles.get(line.trimStart())?.pop() : undefined;
    const file = reportedFile ?? group?.file ?? singleFile ?? details.file ?? failureFile;
    if (file) {
      const timing = files.get(file) ?? { reportedMs: 0, tests: [] };
      if (reportedFile) timing.reportedMs = Math.max(timing.reportedMs, ms);
      else timing.tests.push({ depth, ms });
      files.set(file, timing);
    }
    if (!reportedFile && !details.suite && ms > testMs) {
      slow.push({ name: name.slice(0, 120), ...(file ? { file } : {}), ms, limitMs: testMs });
    }
  }

  for (const [file, timing] of files) {
    const ms = Math.max(timing.reportedMs, sumTests(timing.tests));
    slowestMs = Math.max(slowestMs, ms);
    if (ms > fileMs) slow.push({ name: file.slice(0, 120), file, ms, limitMs: fileMs });
  }

  const reasons = slow.map(({ name, file, ms, limitMs }) =>
    `${name}${file && file !== name ? ` (${file})` : ""} took ${ms} ms (limit ${limitMs} ms).`
  );
  if (!hasTiming) reasons.push("No test or file timings found in the run output.");
  return { ok: reasons.length === 0, slow, slowestMs, reasons };
}
