const riskOrder = ["deleted", "renamed", "changed"] as const;
type Risk = typeof riskOrder[number];
type AtRisk = { path: string; risk: Risk; movedTo?: string };

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function rebaseRisk(input: {
  patchedFiles: readonly string[];
  upstreamChanges: readonly { path: string; status: "added" | "modified" | "deleted" | "renamed"; to?: string }[];
}): { ok: boolean; atRisk: AtRisk[]; summary: string } {
  const patchedFiles = new Set(input.patchedFiles.map(normalizePath).filter(
    (path) => !path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/"),
  ));
  const risksByPath = new Map<string, AtRisk>();

  for (const { path: upstreamPath, status, to } of input.upstreamChanges) {
    const path = normalizePath(upstreamPath);
    if (status === "added" || !patchedFiles.has(path)) continue;

    const risk = status === "modified" ? "changed" : status;
    const previous = risksByPath.get(path);
    if (previous && riskOrder.indexOf(previous.risk) < riskOrder.indexOf(risk)) continue;
    if (previous?.risk === risk && previous.movedTo !== undefined) continue;

    const row: AtRisk = { path, risk };
    if (risk === "renamed" && to !== undefined) row.movedTo = normalizePath(to);
    risksByPath.set(path, row);
  }

  const atRisk = [...risksByPath.values()].sort((left, right) => {
    const byRisk = riskOrder.indexOf(left.risk) - riskOrder.indexOf(right.risk);
    if (byRisk !== 0) return byRisk;
    if (left.path === right.path) return 0;
    return left.path < right.path ? -1 : 1;
  });
  if (atRisk.length === 0) return { ok: true, atRisk, summary: "No hook is touched by this release." };

  const counts = { deleted: 0, renamed: 0, changed: 0 };
  for (const { risk } of atRisk) counts[risk]++;
  const details = riskOrder.filter((risk) => counts[risk] > 0).map((risk) => `${counts[risk]} ${risk}`);
  return {
    ok: false,
    atRisk,
    summary: `${atRisk.length} of ${patchedFiles.size} hooks need a look: ${details.join(", ")}.`,
  };
}
