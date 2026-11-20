const fallbackTitles = {
  html: "HTML page",
  mermaid: "Diagram",
  chart: "Chart",
  image: "Image",
};

type ArtifactKind = keyof typeof fallbackTitles;
type ArtifactVersion = { n: number; createdAt: number; archived?: boolean };

type ArtifactListRecord = {
  id?: string;
  threadId: string;
  kind: string;
  title: string;
  versions: readonly ArtifactVersion[];
};

type ArtifactListRow = {
  artifactId: string;
  kind: ArtifactKind;
  title: string;
  version: number;
  versionCount: number;
  updatedAt: number;
};

function isArtifactKind(kind: string): kind is ArtifactKind {
  return Object.hasOwn(fallbackTitles, kind);
}

export function listThreadArtifacts(
  records: readonly ArtifactListRecord[],
  threadId: string,
  { limit = 50 }: { limit?: number } = {},
): { rows: ArtifactListRow[]; hiddenCount: number; more: boolean } {
  const rowsById = new Map<string, ArtifactListRow>();
  let hiddenCount = 0;

  for (const record of records) {
    if (record.threadId !== threadId) continue;

    const { id, kind, title, versions } = record;
    if (typeof id !== "string" || !id || !isArtifactKind(kind)) {
      hiddenCount++;
      continue;
    }

    let newest: ArtifactVersion | undefined;
    let versionCount = 0;
    for (const version of versions) {
      if (!Number.isFinite(version.createdAt)) {
        newest = undefined;
        break;
      }
      if (version.archived) continue;
      versionCount++;
      if (!newest || version.n > newest.n) newest = version;
    }
    if (!newest) {
      hiddenCount++;
      continue;
    }

    const previous = rowsById.get(id);
    if (previous && (
      previous.version > newest.n ||
      (previous.version === newest.n && previous.updatedAt >= newest.createdAt)
    )) continue;

    rowsById.set(id, {
      artifactId: id,
      kind,
      title: typeof title === "string" && title.trim() ? title : fallbackTitles[kind],
      version: newest.n,
      versionCount,
      updatedAt: newest.createdAt,
    });
  }

  const rows = [...rowsById.values()].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    if (a.artifactId < b.artifactId) return -1;
    if (a.artifactId > b.artifactId) return 1;
    return 0;
  });
  const maxRows = Number.isNaN(limit) ? 50 : Math.min(200, Math.max(1, Math.trunc(limit)));
  return { rows: rows.slice(0, maxRows), hiddenCount, more: rows.length > maxRows };
}
