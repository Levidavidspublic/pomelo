type Change =
  | { path: string; status: "added" | "modified" | "deleted" }
  | { path: string; status: "renamed"; previousPath?: string };

const pomeloTest = /^test\/pomelo-[^/]*\.test\.ts$/;

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

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
    if (change.status === "added" || change.status === "modified") {
      if (path.startsWith("src/pomelo/") || path.startsWith("src/client/pomelo/")) {
        code.push(path);
      } else if (pomeloTest.test(path)) {
        tests.push(path);
      }
    } else if (change.status === "deleted" && pomeloTest.test(path)) {
      problems.push(`The Pomelo test ${JSON.stringify(path)} was deleted.`);
    } else if (change.status === "renamed") {
      // In a path-only rename, path identifies the original test.
      const original = change.previousPath === undefined ? path : normalizePath(change.previousPath);
      if (!pomeloTest.test(original)) continue;
      if (change.previousPath === undefined) {
        problems.push(`The Pomelo test ${JSON.stringify(original)} was renamed without a destination path.`);
      } else if (!pomeloTest.test(path)) {
        problems.push(`The Pomelo test ${JSON.stringify(original)} was renamed outside the test pattern.`);
      }
    }
  }

  if (tests.length === 0) {
    for (const path of code) {
      problems.push(`The change to ${JSON.stringify(path)} needs an added or modified Pomelo test.`);
    }
  }

  return { ok: problems.length === 0, problems: problems.sort(), code: code.sort(), tests: tests.sort() };
}
