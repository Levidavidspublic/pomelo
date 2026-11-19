const MAX_CODE_FILES = 3;
const MAX_TEST_FILES = 1;

export function checkPrScope(paths: string[]): {
  ok: boolean;
  problems: string[];
  counts: { code: number; tests: number };
} {
  const changedPaths = new Set(paths.map((path) => path.replaceAll("\\", "/")));
  const hasPatches = changedPaths.has("PATCHES.md");
  const codePaths: string[] = [];
  const testPaths: string[] = [];
  const problems: string[] = [];

  for (const path of changedPaths) {
    if (path.startsWith("test/") && path.endsWith(".test.ts")) {
      testPaths.push(path);
      continue;
    }

    codePaths.push(path);
    if (path.startsWith(".github/")) {
      problems.push(`${JSON.stringify(path)} belongs to the config lane.`);
    } else if (!hasPatches && !path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) {
      problems.push(`${JSON.stringify(path)} is outside the Pomelo folders and requires a change to PATCHES.md.`);
    }
  }

  if (codePaths.length > MAX_CODE_FILES) {
    const files = codePaths.map((path) => JSON.stringify(path)).join(", ");
    problems.push(`A PR may change at most ${MAX_CODE_FILES} non-test files, but it changes ${codePaths.length} (${files}).`);
  }
  if (testPaths.length > MAX_TEST_FILES) {
    const files = testPaths.map((path) => JSON.stringify(path)).join(", ");
    problems.push(`A PR may change at most ${MAX_TEST_FILES} test file, but it changes ${testPaths.length} (${files}).`);
  }

  return {
    ok: problems.length === 0,
    problems,
    counts: { code: codePaths.length, tests: testPaths.length },
  };
}
