export type LicenceKeepChange = {
  path: string;
  /** The full new text takes precedence over a supplied line count. */
  text?: string;
  /** Count of non-blank lines in the new file. Root LICENSE requires text. */
  lineCount?: number;
} & (
  | { status: "added" | "modified" | "deleted" }
  | { status: "renamed"; previousPath: string }
);

export type LicenceKeepReason =
  | "deleted"
  | "renamed"
  | "empty"
  | "too-short"
  | "missing-content"
  | "missing-text"
  | "missing-mit-heading"
  | "missing-upstream-copyright";

export type LicenceKeepProblem = {
  path: string;
  reason: LicenceKeepReason;
  message: string;
};

export type LicenceKeepResult = { ok: boolean; problems: LicenceKeepProblem[] };

const ROOT_METADATA = new Set(["THIRD-PARTY-NOTICES.md", "PATCHES.md", "POMELO.md"]);
const MIN_LINES = 3;
const MIT_HEADING = "MIT License";
const UPSTREAM_COPYRIGHT = "Copyright (c) 2026 Arun Dass";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isProtectedLicencePath(path: string): boolean {
  const normalized = normalizePath(path);
  const name = normalized.slice(normalized.lastIndexOf("/") + 1);
  return ROOT_METADATA.has(normalized) || name === "NOTICE" || name.startsWith("LICENSE");
}

/** Paths are repository-relative, and a rename's path is its destination. */
export function licenceKeepCheck(changes: readonly LicenceKeepChange[]): LicenceKeepResult {
  const problems: LicenceKeepProblem[] = [];

  for (const change of changes) {
    const path = normalizePath(change.path);
    if (change.status === "renamed") {
      const previousPath = normalizePath(change.previousPath);
      if (previousPath !== path && isProtectedLicencePath(previousPath)) {
        problems.push({ path: previousPath, reason: "renamed", message: `${previousPath} was renamed to ${path}.` });
      }
    }

    if (!isProtectedLicencePath(path)) continue;
    if (change.status === "deleted") {
      problems.push({ path, reason: "deleted", message: `${path} was deleted.` });
      continue;
    }

    const lines = change.text?.split(/\r?\n/);
    const lineCount = lines?.filter((line) => line.trim().length > 0).length ?? change.lineCount;
    if (lineCount === undefined || !Number.isSafeInteger(lineCount) || lineCount < 0) {
      problems.push({ path, reason: "missing-content", message: `${path} needs its new text or a valid line count.` });
      continue;
    }
    if (lineCount === 0) {
      problems.push({ path, reason: "empty", message: `${path} was emptied.` });
    } else if (lineCount < MIN_LINES) {
      problems.push({ path, reason: "too-short", message: `${path} needs at least ${MIN_LINES} non-blank lines.` });
    }

    if (path !== "LICENSE") continue;
    if (lines === undefined) {
      problems.push({ path, reason: "missing-text", message: `${path} needs its new text to verify Friday's MIT heading and copyright line.` });
      continue;
    }
    if (!lines.includes(MIT_HEADING)) {
      problems.push({ path, reason: "missing-mit-heading", message: `${path} is missing the MIT License heading.` });
    }
    if (!lines.includes(UPSTREAM_COPYRIGHT)) {
      problems.push({ path, reason: "missing-upstream-copyright", message: `${path} is missing Friday's original copyright line.` });
    }
  }

  problems.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { ok: problems.length === 0, problems };
}
