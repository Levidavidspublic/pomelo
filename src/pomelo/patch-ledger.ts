const pomeloFiles = new Set(["PATCHES.md", "THIRD-PARTY-NOTICES.md", "POMELO.md"]);

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function ledgerFiles(ledgerText: string): string[] {
  const files: string[] = [];

  for (const line of ledgerText.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;

    const firstCell = line.split("|", 2)[1];
    const match = firstCell?.match(/`([^`]+)`/);
    if (match) files.push(normalizePath(match[1]));
  }

  return files;
}

export function isPomeloPath(path: string): boolean {
  const normalized = normalizePath(path);
  return pomeloFiles.has(normalized)
    || normalized.startsWith("src/pomelo/")
    || normalized.startsWith("src/client/pomelo/")
    || /^test\/pomelo-[^/]*$/.test(normalized)
    || normalized.startsWith("docs/");
}

export function unlistedPatches(changedPaths: readonly string[], ledgerText: string): string[] {
  const listedFiles = new Set(ledgerFiles(ledgerText));
  const unlistedFiles = new Set<string>();

  for (const path of changedPaths) {
    if (isPomeloPath(path)) continue;

    const normalized = normalizePath(path);
    if (!listedFiles.has(normalized)) unlistedFiles.add(normalized);
  }

  return [...unlistedFiles].sort();
}
