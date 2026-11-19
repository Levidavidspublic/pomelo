import type { Artifact } from "./artifact.js";

export type ArtifactVersion = Artifact & { archivedAt?: number };

export type VersionSelection =
  | { version: ArtifactVersion; reason?: never }
  | { version: ArtifactVersion | null; reason: "archived" | "missing" };

function isValidVersion(version: number): boolean {
  return Number.isSafeInteger(version) && version > 0;
}

/** Mark a version in one artifact's history, preserving its first archive time. */
export function archiveVersion(versions: readonly ArtifactVersion[], version: number, now: number): ArtifactVersion[] {
  if (!isValidVersion(version)) return versions.slice();

  return versions.map((record) => {
    if (record.version !== version || record.archivedAt !== undefined) return record;
    return { ...record, archivedAt: now };
  });
}

export function unarchiveVersion(versions: readonly ArtifactVersion[], version: number): ArtifactVersion[] {
  if (!isValidVersion(version)) return versions.slice();

  return versions.map((record) => {
    if (record.version !== version || record.archivedAt === undefined) return record;
    const { archivedAt, ...restored } = record;
    return restored;
  });
}

export function visibleVersions(versions: readonly ArtifactVersion[]): ArtifactVersion[] {
  return versions.filter((record) => record.archivedAt === undefined).sort((a, b) => a.version - b.version);
}

export function currentVersion(versions: readonly ArtifactVersion[]): ArtifactVersion | null {
  let current: ArtifactVersion | null = null;
  for (const record of versions) {
    if (record.archivedAt === undefined && (current === null || record.version > current.version)) {
      current = record;
    }
  }
  return current;
}

export function pickVersion(versions: readonly ArtifactVersion[], wanted: number): VersionSelection {
  const requested = versions.find((record) => record.version === wanted);
  if (requested && requested.archivedAt === undefined) return { version: requested };

  return { version: currentVersion(versions), reason: requested ? "archived" : "missing" };
}
