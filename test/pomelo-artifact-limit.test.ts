import assert from "node:assert/strict";
import { test } from "node:test";
import { ARTIFACT_LIMITS, checkArtifactSave, type ArtifactSaveInput } from "../src/pomelo/artifact-limit.js";

const input: ArtifactSaveInput = { kind: "html", bodyBytes: 100, versionCount: 0, threadBytes: 0 };
const MiB = 1024 * 1024;

test("a small HTML body can be saved", () => {
  assert.deepEqual(checkArtifactSave(input), { ok: true });
});

test("each kind accepts its byte limit and refuses one byte more", () => {
  assert.deepEqual(ARTIFACT_LIMITS.bodyBytesByKind, {
    html: 2 * MiB,
    markdown: MiB,
    code: MiB,
    svg: 2 * MiB,
    image: 10 * MiB,
    data: 5 * MiB,
  });

  for (const kind of Object.keys(ARTIFACT_LIMITS.bodyBytesByKind) as ArtifactSaveInput["kind"][]) {
    const limitBytes: number = ARTIFACT_LIMITS.bodyBytesByKind[kind];
    assert.deepEqual(checkArtifactSave({ ...input, kind, bodyBytes: limitBytes }), { ok: true }, kind);
    assert.deepEqual(checkArtifactSave({ ...input, kind, bodyBytes: limitBytes + 1 }), {
      ok: false, reason: "too-big", limitBytes,
    }, kind);
  }
});

test("an empty body is refused", () => {
  assert.deepEqual(checkArtifactSave({ ...input, bodyBytes: 0 }), {
    ok: false, reason: "empty", limitBytes: 0,
  });
});

test("the 50th version can be saved and the 51st is refused", () => {
  assert.equal(ARTIFACT_LIMITS.maxVersions, 50);
  assert.deepEqual(checkArtifactSave({ ...input, versionCount: 49 }), { ok: true });
  assert.deepEqual(checkArtifactSave({ ...input, versionCount: 50 }), {
    ok: false, reason: "too-many-versions", limitBytes: 0,
  });
});

test("a save can fill the thread exactly but cannot exceed its byte limit", () => {
  const limitBytes = ARTIFACT_LIMITS.maxThreadBytes;
  assert.equal(limitBytes, 200 * MiB);
  const threadBytes = limitBytes - input.bodyBytes;
  assert.deepEqual(checkArtifactSave({ ...input, threadBytes }), { ok: true });
  assert.deepEqual(checkArtifactSave({ ...input, threadBytes: threadBytes + 1 }), {
    ok: false, reason: "thread-full", limitBytes,
  });
});

test("malformed inputs return bad-input without throwing", () => {
  const expected = { ok: false, reason: "bad-input", limitBytes: 0 };
  for (const value of [null, undefined, 123, {}, { ...input, kind: "unknown" }, { ...input, kind: "toString" }]) {
    assert.deepEqual(checkArtifactSave(value as ArtifactSaveInput), expected);
  }

  for (const field of ["kind", "bodyBytes", "versionCount", "threadBytes"] as const) {
    const missingField: Partial<ArtifactSaveInput> = { ...input };
    delete missingField[field];
    assert.deepEqual(checkArtifactSave(missingField as ArtifactSaveInput), expected);
  }
  for (const field of ["bodyBytes", "versionCount", "threadBytes"] as const) {
    for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, "100"]) {
      assert.deepEqual(checkArtifactSave({ ...input, [field]: value } as ArtifactSaveInput), expected, field);
    }
  }

  const unreadableInput = {
    ...input,
    get bodyBytes(): number { throw new Error("unreadable"); },
  };
  assert.deepEqual(checkArtifactSave(unreadableInput), expected);
});

test("the decision contains only quota metadata even when the caller has body text", () => {
  const oversized = {
    ...input,
    body: "<p>Example artifact</p>",
    bodyBytes: ARTIFACT_LIMITS.bodyBytesByKind.html + 1,
  };
  assert.deepEqual(checkArtifactSave(oversized), {
    ok: false, reason: "too-big", limitBytes: ARTIFACT_LIMITS.bodyBytesByKind.html,
  });
});
