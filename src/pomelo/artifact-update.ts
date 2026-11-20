export type ArtifactSaveRequest = {
  /** The thread resolved by the caller for this save. */
  threadId: string;
  artifactId?: string;
  kind: string;
  bodyHash: string;
  restore?: boolean;
};

export type ArtifactSaveVersion = {
  version: number;
  bodyHash: string;
  archived?: boolean;
  /** Archive timestamp used by the artifact history. */
  archivedAt?: number;
};

export type ArtifactSaveHistory = {
  artifactId: string;
  threadId: string;
  kind: string;
  versions: readonly ArtifactSaveVersion[];
};

const refusalReasons = {
  "bad-id": "Use an artifact ID with only letters, numbers, underscores and hyphens.",
  "not-found": "This artifact could not be found.",
  "other-thread": "Use an artifact from this thread or save a new one.",
  "kind-changed": "Keep the existing artifact kind or save a new artifact.",
  archived: "Set restore to true to save a new version of this archived artifact.",
  "invalid-version": "This artifact's version history cannot be extended safely.",
};

export type ArtifactSaveRefusalCode = keyof typeof refusalReasons;

type ArtifactSaveRefusal = { action: "refuse"; code: ArtifactSaveRefusalCode; reason: string };

export type ArtifactSaveDecision =
  | { action: "new-artifact"; version: 1 }
  | { action: "new-version"; version: number }
  | { action: "same-as-latest"; version: number }
  | ArtifactSaveRefusal;

function refuse(code: ArtifactSaveRefusalCode): ArtifactSaveRefusal {
  return { action: "refuse", code, reason: refusalReasons[code] };
}

/** Decide a save against the full history for the requested ID, including archived versions. */
export function decideArtifactSave(
  request: ArtifactSaveRequest,
  existing?: ArtifactSaveHistory | null,
): ArtifactSaveDecision {
  const { artifactId, threadId, kind, bodyHash, restore } = request;
  if (artifactId === undefined) return { action: "new-artifact", version: 1 };
  if (typeof artifactId !== "string" || !artifactId || /[^\w-]/.test(artifactId)) return refuse("bad-id");
  if (!existing || existing.artifactId !== artifactId) return refuse("not-found");
  if (existing.threadId !== threadId) return refuse("other-thread");
  if (existing.kind !== kind) return refuse("kind-changed");

  let latest: ArtifactSaveVersion | undefined;
  for (const record of existing.versions) {
    if (!Number.isSafeInteger(record.version) || record.version < 1) return refuse("invalid-version");
    if (!latest || record.version > latest.version) latest = record;
  }
  if (!latest) return refuse("not-found");

  const archived = latest.archived === true || latest.archivedAt !== undefined;
  if (archived && restore !== true) return refuse("archived");
  if (!archived && latest.bodyHash === bodyHash) return { action: "same-as-latest", version: latest.version };
  if (latest.version === Number.MAX_SAFE_INTEGER) return refuse("invalid-version");
  return { action: "new-version", version: latest.version + 1 };
}
