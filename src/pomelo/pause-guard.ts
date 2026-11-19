export interface PauseFileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;
}

export interface PauseFileFinding {
  path: string;
  status: PauseFileChange["status"];
  reason: string;
}

export interface PauseFileResult {
  ok: boolean;
  findings: PauseFileFinding[];
}

function hasPauseFileName(path: string): boolean {
  return path.slice(path.lastIndexOf("/") + 1).toUpperCase() === "PAUSE_AUTOMERGE";
}

/** For renames, path is the destination and oldPath is the source. */
export function checkPauseFile(changes: readonly PauseFileChange[]): PauseFileResult {
  const findings: PauseFileFinding[] = [];

  for (const { path, status, oldPath } of changes) {
    const destination = path.replaceAll("\\", "/");
    const source = status === "renamed" ? oldPath?.replaceAll("\\", "/") : undefined;
    const matchedPath = [destination, source].find((path) => path !== undefined && hasPauseFileName(path));
    if (matchedPath === undefined) continue;

    findings.push({
      path: matchedPath,
      status,
      reason: "Only Amit can change the auto-merge pause file or files with the same name.",
    });
  }

  return { ok: findings.length === 0, findings };
}
