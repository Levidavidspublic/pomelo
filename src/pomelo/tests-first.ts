type Change =
  | { path: string; status: "added" | "modified" | "deleted" }
  | { path: string; status: "renamed"; previousPath?: string };

const pomeloTest = /^test\/pomelo-[^/]*\.test\.ts$/;

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

/** For renames, `path` is the destination and `previousPath` is required. A missing source path is reported as a problem. */
export function checkTestsFirst(changes: readonly Change[]): {
  ok: boolean;
  problems: string[];
  code: string[];
  tests: string[];
} {
  const code: string[] = [];
  const tests: string[] = [];
  const problems: string[] = [];

  for (const change of changes) {
    const path = normalizePath(change.path);
    if (change.status === "deleted") {
      if (pomeloTest.test(path)) {
        problems.push(`The Pomelo test ${JSON.stringify(path)} was deleted.`);
      }
      continue;
    }

    if (path.startsWith("src/pomelo/") || path.startsWith("src/client/pomelo/")) {
      code.push(path);
    }

    if (change.status === "renamed") {
      const previousPath = normalizePath(change.previousPath ?? "");
      if (!previousPath) {
        problems.push(`The rename to ${JSON.stringify(path)} needs a previous path.`);
      } else if (pomeloTest.test(previousPath) && !pomeloTest.test(path)) {
        problems.push(`The Pomelo test ${JSON.stringify(previousPath)} was renamed outside the test pattern.`);
      }
    } else if (pomeloTest.test(path)) {
      tests.push(path);
    }
  }

  if (tests.length === 0) {
    for (const path of code) {
      problems.push(`The change to ${JSON.stringify(path)} needs an added or modified Pomelo test.`);
    }
  }

  return { ok: problems.length === 0, problems: problems.sort(), code: code.sort(), tests: tests.sort() };
}
