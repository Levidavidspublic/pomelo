import { posix } from "node:path";

const MAX_CODE_FILES = 3;
const MAX_TEST_FILES = 1;
const TICKET_FIELDS = new Set(["key", "title", "phase", "when", "scope", "steps", "done", "needs_amit"]);
const DONE_LINE = /^(`?)npm test -- (test\/[\w.+-]+\.test\.ts)\1 -> (.+?)(?: && npm run typecheck)?$/;

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function doneTestPath(done: unknown): string | undefined {
  if (!isNonemptyString(done)) return;

  const match = DONE_LINE.exec(done.trim());
  if (match === null) return;

  const [, , testPath, expected] = match;
  if (!isNonemptyString(expected) || /&&|;|\btest\/[^\s`]+\.test\.ts\b/.test(expected)) return;
  return testPath;
}

export function checkTicketShape(ticket: unknown): { ok: boolean; problems: string[] } {
  if (ticket === null || typeof ticket !== "object" || Array.isArray(ticket)) {
    return { ok: false, problems: ["The ticket must be an object."] };
  }

  const { key, title, phase, when, scope, steps, done, needs_amit } = ticket as Record<string, unknown>;
  const problems: string[] = [];

  for (const field of Object.keys(ticket)) {
    if (!TICKET_FIELDS.has(field)) problems.push(`The ticket has an unknown field ${JSON.stringify(field)}.`);
  }
  if (!isNonemptyString(key)) problems.push("The ticket key must be a nonempty string.");
  if (!isNonemptyString(title)) problems.push("The ticket title must be a nonempty string.");
  if (!isNonemptyString(phase) && !(typeof phase === "number" && Number.isInteger(phase) && phase >= 0)) {
    problems.push("The ticket phase must be a nonempty label or a nonnegative integer.");
  }
  if (typeof needs_amit !== "boolean") problems.push("The needs_amit field must be true or false.");
  if (!Array.isArray(when) || !Array.from(when).every((item) => typeof item === "string" && /^#\d+$/.test(item))) {
    problems.push("WHEN must be a list of #<number> strings.");
  }
  if (!Array.isArray(steps) || steps.length === 0 || !Array.from(steps).every(isNonemptyString)) {
    problems.push("STEPS must be a nonempty list of step descriptions.");
  } else if (!steps[0].startsWith("code-map:")) {
    problems.push('The first step in STEPS must start with "code-map:".');
  }

  const testPath = doneTestPath(done);
  if (testPath === undefined) {
    problems.push("DONE must contain one npm test -- test/<name>.test.ts command, followed by -> and the expected result, with only npm run typecheck allowed after &&.");
  }

  const backtickedPaths = typeof scope === "string"
    ? Array.from(scope.matchAll(/`([^`\r\n]*)`/g), ([, path]) => path.trim())
    : [];
  const scopePaths = new Set(backtickedPaths.filter(Boolean).map((path) => posix.normalize(path.replaceAll("\\", "/"))));
  if (scopePaths.size === 0) {
    problems.push("SCOPE must list file paths in backticks.");
  } else if (testPath !== undefined && !scopePaths.has(testPath)) {
    problems.push(`The DONE test ${JSON.stringify(testPath)} must be listed in SCOPE.`);
  }

  if (needs_amit !== true) {
    const hasPatches = scopePaths.has("PATCHES.md");
    const codePaths: string[] = [];
    const testPaths: string[] = [];

    for (const path of scopePaths) {
      if (/^test\/[^/]+\.test\.ts$/.test(path)) {
        testPaths.push(path);
        continue;
      }

      codePaths.push(path);
      if (path.startsWith(".github/")) {
        problems.push(`The SCOPE path ${JSON.stringify(path)} requires needs_amit to be true.`);
      } else if (!hasPatches && !path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) {
        problems.push(`The SCOPE path ${JSON.stringify(path)} is outside the Pomelo folders and requires PATCHES.md.`);
      }
    }

    if (codePaths.length > MAX_CODE_FILES) {
      problems.push(`SCOPE may list at most ${MAX_CODE_FILES} code files, but lists ${codePaths.length} (${codePaths.map((path) => JSON.stringify(path)).join(", ")}).`);
    }
    if (testPaths.length > MAX_TEST_FILES) {
      problems.push(`SCOPE may list at most ${MAX_TEST_FILES} test file, but lists ${testPaths.length} (${testPaths.map((path) => JSON.stringify(path)).join(", ")}).`);
    }
  }

  return { ok: problems.length === 0, problems };
}
