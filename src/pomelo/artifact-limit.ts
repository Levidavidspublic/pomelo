import type { Artifact } from "./artifact.js";

// The quota policy shares HTML and image with the current artifact records.
type ArtifactSaveKind = Extract<Artifact["kind"], "html" | "image"> | "markdown" | "code" | "svg" | "data";

export interface ArtifactSaveInput {
  kind: ArtifactSaveKind;
  bodyBytes: number;
  /** Versions already saved for this artifact, including archived versions. */
  versionCount: number;
  /** Bytes already used by the thread's artifact bodies, including archived bodies. */
  threadBytes: number;
}

export type ArtifactSaveResult =
  | { ok: true }
  | { ok: false; reason: "too-big" | "thread-full"; limitBytes: number }
  | { ok: false; reason: "too-many-versions" | "empty" | "bad-input"; limitBytes: 0 };

const MiB = 1024 * 1024;

export const ARTIFACT_LIMITS = Object.freeze({
  bodyBytesByKind: Object.freeze({
    html: 2 * MiB,
    markdown: MiB,
    code: MiB,
    svg: 2 * MiB,
    image: 10 * MiB,
    data: 5 * MiB,
  } satisfies Record<ArtifactSaveKind, number>),
  maxVersions: 50,
  maxThreadBytes: 200 * MiB,
});

function readField(input: object, key: keyof ArtifactSaveInput): unknown {
  try {
    const property = Object.getOwnPropertyDescriptor(input, key);
    return property && Object.hasOwn(property, "value") ? property.value : undefined;
  } catch {
    return undefined;
  }
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Check a proposed save against existing usage. A refusal without a byte ceiling uses limitBytes: 0. */
export function checkArtifactSave(input: ArtifactSaveInput): ArtifactSaveResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "bad-input", limitBytes: 0 };
  }

  const kind = readField(input, "kind");
  const bodyBytes = readField(input, "bodyBytes");
  const versionCount = readField(input, "versionCount");
  const threadBytes = readField(input, "threadBytes");
  const { bodyBytesByKind, maxVersions, maxThreadBytes } = ARTIFACT_LIMITS;

  if (typeof kind !== "string" || !Object.hasOwn(bodyBytesByKind, kind)
    || !isCount(bodyBytes) || !isCount(versionCount) || !isCount(threadBytes)) {
    return { ok: false, reason: "bad-input", limitBytes: 0 };
  }
  if (bodyBytes === 0) return { ok: false, reason: "empty", limitBytes: 0 };

  const limitBytes = bodyBytesByKind[kind as ArtifactSaveKind];
  if (bodyBytes > limitBytes) return { ok: false, reason: "too-big", limitBytes };
  if (versionCount >= maxVersions) return { ok: false, reason: "too-many-versions", limitBytes: 0 };
  if (bodyBytes > maxThreadBytes - threadBytes) {
    return { ok: false, reason: "thread-full", limitBytes: maxThreadBytes };
  }
  return { ok: true };
}
