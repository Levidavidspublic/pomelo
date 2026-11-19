export function checkUpstreamTests(changes: readonly {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  from?: string;
}[]): { ok: boolean; problems: { path: string; status: string; why: string }[] } {
  const problems: { path: string; status: string; why: string }[] = [];

  for (const { path, status, from } of changes) {
    const checkedPath = (status === "renamed" ? from ?? path : path).replaceAll("\\", "/");
    const isFridayTestFile = checkedPath.startsWith("test/") && !checkedPath.startsWith("test/pomelo-");
    const changesRunner = checkedPath === "scripts/test.mjs" && status !== "added";
    if (!isFridayTestFile && !changesRunner) continue;

    const why = status === "added"
      ? "New files under test/ must use the test/pomelo- prefix."
      : "Keep Friday's test files and runner unchanged.";
    problems.push({ path: checkedPath, status, why });
  }

  problems.sort((left, right) => {
    if (left.path === right.path) return 0;
    return left.path < right.path ? -1 : 1;
  });

  return { ok: problems.length === 0, problems };
}
