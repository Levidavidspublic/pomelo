import { currentVersion, pickVersion, type ArtifactVersion } from "./artifact-archive.js";
import { artifactHeaders } from "./artifact-headers.js";
import { ARTIFACT_LIMITS } from "./artifact-limit.js";
import { artifactKey, checkBodyRef, type Artifact } from "./artifact.js";

export type ArtifactServeRequest = {
  threadId: string;
  artifactId: string;
  version?: number;
  download?: boolean;
};

export type ArtifactServeDeps = {
  loadVersions(artifactId: string): readonly ArtifactVersion[] | null | Promise<readonly ArtifactVersion[] | null>;
  readBody(bodyRef: string): Uint8Array | null | Promise<Uint8Array | null>;
};

export type ArtifactServeResult =
  | { status: 200; headers: Record<string, string>; body: Uint8Array }
  | { status: 400 | 404 | 410 | 413 | 500; code: string; message: string };

const limits = ARTIFACT_LIMITS.bodyBytesByKind;
const bodyByteLimits: Record<Artifact["kind"], number> = {
  html: limits.html,
  mermaid: limits.code,
  chart: limits.data,
  image: limits.image,
};

function notFound(): ArtifactServeResult {
  return { status: 404, code: "not-found", message: "This artifact was not found." };
}

export async function serveArtifact(
  { threadId, artifactId, version, download }: ArtifactServeRequest,
  deps: ArtifactServeDeps,
): Promise<ArtifactServeResult> {
  try {
    artifactKey(artifactId);
    artifactKey(threadId);
  } catch {
    return { status: 400, code: "bad-id", message: "Use only letters, numbers, underscores and hyphens in an ID." };
  }
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) {
    return { status: 400, code: "bad-version", message: "Use a positive whole number for the version." };
  }

  try {
    const versions = await deps.loadVersions(artifactId);
    if (!versions || versions.some((record) => record.id !== artifactId || record.threadId !== threadId)) {
      return notFound();
    }

    let record: ArtifactVersion | null;
    if (version === undefined) {
      record = currentVersion(versions);
    } else {
      const selection = pickVersion(versions, version);
      if (selection.reason === "archived") {
        return { status: 410, code: "put-away", message: "This version was put away." };
      }
      if (selection.reason === "missing") return notFound();
      record = selection.version;
    }
    if (!record || !checkBodyRef(record.bodyRef)) return notFound();

    const { kind, bodyRef } = record;
    const body = await deps.readBody(bodyRef);
    if (body === null) return notFound();
    if (body.byteLength > bodyByteLimits[kind]) {
      return { status: 413, code: "too-big", message: "This artifact is too big to serve." };
    }

    return { status: 200, headers: artifactHeaders({ kind, fileName: bodyRef, download }), body };
  } catch {
    return { status: 500, code: "load-failed", message: "This artifact could not be loaded." };
  }
}
