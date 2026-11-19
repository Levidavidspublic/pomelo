export const ARTIFACT_KINDS = Object.freeze(["html", "mermaid", "chart", "image"] as const);

export type Artifact = {
  id: string;
  threadId: string;
  kind: (typeof ARTIFACT_KINDS)[number];
  version: number;
  bodyRef: string;
  createdAt: number;
};

export function artifactKey(id: string): string {
  if (typeof id !== "string" || !id || /[^\w-]/.test(id)) {
    throw new Error("Invalid artifact id");
  }
  return `pomelo:artifact:${id}`;
}

// Windows can interpret these names as devices even when they have an extension.
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)/i;

/** Check the spelling of a relative file reference under FRIDAY_HOME/artifacts. */
export function checkBodyRef(bodyRef: string): boolean {
  // Reject URL escapes, drive prefixes, and characters that are unsafe in file names.
  if (typeof bodyRef !== "string" || bodyRef.startsWith("~") || /[\\:%<>|"?*\x00-\x1f]/.test(bodyRef)) {
    return false;
  }
  // Empty segments include absolute paths. Trailing dots and spaces can be stripped on Windows.
  return bodyRef.split("/").every((part) => part.length > 0 && !/[. ]$/.test(part) && !WINDOWS_DEVICE.test(part));
}

export function newArtifact({ id, threadId, kind, bodyRef, createdAt }: Omit<Artifact, "version">): Artifact {
  artifactKey(id);
  if (!ARTIFACT_KINDS.includes(kind)) throw new Error("Invalid artifact kind");
  if (!checkBodyRef(bodyRef)) throw new Error("Invalid artifact bodyRef");
  return { id, threadId, kind, version: 1, bodyRef, createdAt };
}

/** Build a separate version record. With no new timestamp, keep the artifact's previous createdAt. */
export function nextVersion(previous: Artifact, bodyRef: string, createdAt = previous.createdAt): Artifact {
  const { version } = previous;
  if (!Number.isSafeInteger(version) || version < 1 || version === Number.MAX_SAFE_INTEGER) {
    throw new Error("Invalid previous artifact version");
  }
  return { ...newArtifact({ ...previous, bodyRef, createdAt }), version: version + 1 };
}
