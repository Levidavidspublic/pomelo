function normalizePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
}

export function checkScopeMatch(scopeText: string, changedPaths: readonly string[]): {
  ok: boolean;
  outside: string[];
  untouched: string[];
  reasons: string[];
} {
  const scope = new Set<string>();
  for (const [, entry] of scopeText.matchAll(/`([^`\r\n]*)`/g)) {
    const path = normalizePath(entry);
    if (path) scope.add(path);
  }

  const changed = new Set(changedPaths.map(normalizePath));
  const outside = [...changed].filter((path) => !scope.has(path)).sort();
  const untouched = [...scope].filter((path) => !changed.has(path)).sort();

  const reasons: string[] = [];
  if (scope.size === 0) reasons.push("SCOPE must list file paths in backticks.");
  for (const path of outside) {
    reasons.push(`The PR changed ${JSON.stringify(path)}, which SCOPE does not list.`);
  }
  for (const path of untouched) {
    if (path.startsWith("test/") && path.endsWith(".test.ts")) {
      reasons.push(`The PR did not change the test file ${JSON.stringify(path)} listed in SCOPE.`);
    }
  }

  return { ok: reasons.length === 0, outside, untouched, reasons };
}
