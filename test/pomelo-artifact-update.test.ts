import assert from "node:assert/strict";
import { test } from "node:test";
import { decideArtifactSave, type ArtifactSaveRequest, type ArtifactSaveHistory } from "../src/pomelo/artifact-update.js";

const request: ArtifactSaveRequest = {
  artifactId: "artifact_1-draft",
  threadId: "thread-1",
  kind: "html",
  bodyHash: "hash-new",
};
const first = { version: 1, bodyHash: "hash-first" };
const second = { version: 2, bodyHash: "hash-second" };
const third = { version: 3, bodyHash: "hash-third" };
const history: ArtifactSaveHistory = {
  artifactId: "artifact_1-draft",
  threadId: "thread-1",
  kind: "html",
  versions: [first, third, second],
};

test("omitting the artifact id starts a new artifact at version one", () => {
  const { threadId, kind, bodyHash } = request;
  assert.deepEqual(decideArtifactSave({ threadId, kind, bodyHash }, null), {
    action: "new-artifact", version: 1,
  });
});

test("a save in the owning thread uses one more than the highest version", () => {
  assert.deepEqual(decideArtifactSave(request, history), { action: "new-version", version: 4 });
});

test("a hash that matches the newest live version returns its version number", () => {
  assert.deepEqual(decideArtifactSave({ ...request, bodyHash: third.bodyHash }, history), {
    action: "same-as-latest", version: 3,
  });
  assert.deepEqual(decideArtifactSave({ ...request, bodyHash: first.bodyHash }, history), {
    action: "new-version", version: 4,
  });
});

test("another thread cannot update the artifact or receive the owner's thread id", () => {
  const result = decideArtifactSave({ ...request, threadId: "thread-2", bodyHash: third.bodyHash, restore: true }, history);
  assert.equal(result.action, "refuse");
  assert.equal(result.code, "other-thread");
  assert.equal(result.reason.includes(history.threadId), false);
});

test("the artifact kind cannot change even if the body hash matches", () => {
  const result = decideArtifactSave({ ...request, kind: "mermaid", bodyHash: third.bodyHash }, history);
  assert.equal(result.action, "refuse");
  assert.equal(result.code, "kind-changed");
});

test("an unknown id is refused", () => {
  for (const existing of [null, { ...history, artifactId: "different-artifact" }, { ...history, versions: [] }]) {
    const result = decideArtifactSave(request, existing);
    assert.equal(result.action, "refuse");
    assert.equal(result.code, "not-found");
  }
});

test("an empty id or one containing separators, dots or controls is refused", () => {
  for (const artifactId of ["", "folder/artifact", "folder\\artifact", "..", "artifact.v1", "artifact\0", "artifact\n"]) {
    const result = decideArtifactSave({ ...request, artifactId }, null);
    assert.equal(result.action, "refuse");
    assert.equal(result.code, "bad-id");
  }
});

test("an archived newest version requires explicit restore and keeps its version number reserved", () => {
  for (const archive of [{ archived: true }, { archivedAt: 0 }]) {
    const existing = { ...history, versions: [first, second, { ...third, ...archive }] };
    for (const bodyHash of [request.bodyHash, third.bodyHash]) {
      const save = { ...request, bodyHash };
      const result = decideArtifactSave(save, existing);
      assert.equal(result.action, "refuse");
      assert.equal(result.code, "archived");
      assert.deepEqual(decideArtifactSave({ ...save, restore: true }, existing), {
        action: "new-version", version: 4,
      });
    }
  }
});

test("an archive on an older version leaves the newest live version available", () => {
  const existing = { ...history, versions: [{ ...first, archived: true }, third, second] };
  assert.deepEqual(decideArtifactSave({ ...request, bodyHash: third.bodyHash }, existing), {
    action: "same-as-latest", version: 3,
  });
});

test("refusal reasons never echo text from the request", () => {
  const canary = ["ghp", "_", "a".repeat(36)].join("");
  const cases = [
    { ...request, artifactId: `${canary}/bad` },
    { ...request, artifactId: canary },
    { ...request, threadId: canary },
    { ...request, kind: canary },
  ];
  for (const save of cases) {
    const result = decideArtifactSave({ ...save, bodyHash: canary }, history);
    assert.equal(result.action, "refuse");
    assert.equal(result.reason.includes(canary), false);
  }
});

test("a save cannot allocate an unsafe version number", () => {
  const existing = { ...history, versions: [{ ...third, version: Number.MAX_SAFE_INTEGER }] };
  const result = decideArtifactSave(request, existing);
  assert.equal(result.action, "refuse");
  assert.equal(result.code, "invalid-version");
  assert.deepEqual(decideArtifactSave({ ...request, bodyHash: third.bodyHash }, existing), {
    action: "same-as-latest", version: Number.MAX_SAFE_INTEGER,
  });
});

test("deciding a save leaves its request and every version record unchanged", () => {
  const save = Object.freeze({ ...request, restore: true });
  const versions = Object.freeze([
    Object.freeze({ ...third, archived: true }), Object.freeze({ ...first }), Object.freeze({ ...second }),
  ]);
  const existing = Object.freeze({ ...history, versions });
  assert.deepEqual(decideArtifactSave(save, existing), { action: "new-version", version: 4 });
});
