import assert from "node:assert/strict";
import test from "node:test";
import { moveVerify } from "../src/pomelo/browser/move-verify.js";

const archive = Object.freeze({
  profileId: "test-profile",
  bytes: 4096,
  sha256: "ab".repeat(32),
  sealed: true,
});
const facts = Object.freeze({
  source: archive,
  target: Object.freeze({ ...archive }),
  testOpen: "ok",
  triesSoFar: 1,
  profileBusy: false,
} as const);

test("matching sealed archives and a clean VPS test open allow the PC copy to be put away", () => {
  for (const sha256 of [archive.sha256, archive.sha256.toUpperCase()]) {
    const target = { ...archive, sha256, path: "/example/vps-profile.archive" };
    assert.deepEqual(moveVerify({ ...facts, target }), {
      verdict: "complete", pcCopy: "put-away", reason: "verified",
    });
  }
});

test("size and checksum mismatches keep the PC copy and allow two retries by default", () => {
  const mismatches = [
    [{ ...archive, bytes: archive.bytes + 1 }, "size-mismatch"],
    [{ ...archive, sha256: "cd".repeat(32) }, "checksum-mismatch"],
  ] as const;

  for (const [target, reason] of mismatches) {
    for (const triesSoFar of [1, 2]) {
      assert.deepEqual(moveVerify({ ...facts, target, triesSoFar, testOpen: "not-run" }), {
        verdict: "copy-again", pcCopy: "keep", reason,
      });
    }
    for (const triesSoFar of [3, 4]) {
      assert.deepEqual(moveVerify({ ...facts, target, triesSoFar }), {
        verdict: "hold", pcCopy: "keep", reason: "retry-limit",
      });
    }
  }
});

test("a custom attempt limit applies to mismatches and still permits a verified final copy", () => {
  const target = { ...archive, bytes: archive.bytes + 1 };
  assert.deepEqual(moveVerify({ ...facts, target, maxTries: 1 }), {
    verdict: "hold", pcCopy: "keep", reason: "retry-limit",
  });
  assert.deepEqual(moveVerify({ ...facts, target, triesSoFar: 3, maxTries: 4 }), {
    verdict: "copy-again", pcCopy: "keep", reason: "size-mismatch",
  });
  assert.deepEqual(moveVerify({ ...facts, maxTries: 1 }), {
    verdict: "complete", pcCopy: "put-away", reason: "verified",
  });
});

test("a different profile ID holds immediately", () => {
  const target = { ...archive, profileId: "other-profile" };
  assert.deepEqual(moveVerify({ ...facts, target }), {
    verdict: "hold", pcCopy: "keep", reason: "wrong-profile",
  });
});

test("matching archives stay on hold when the VPS test open fails or has yet to run", () => {
  for (const testOpen of ["failed", "not-run"] as const) {
    assert.deepEqual(moveVerify({ ...facts, testOpen }), {
      verdict: "hold", pcCopy: "keep", reason: `test-open-${testOpen}`,
    });
  }
});

test("an unsealed archive on either side holds immediately", () => {
  for (const side of ["source", "target"] as const) {
    assert.deepEqual(moveVerify({ ...facts, [side]: { ...archive, sealed: false } }), {
      verdict: "hold", pcCopy: "keep", reason: "not-sealed",
    });
  }
});

test("invalid archive metadata holds even when both reports agree", () => {
  for (const invalid of [
    { sha256: "a".repeat(63) }, { sha256: "g".repeat(64) }, { sha256: `${archive.sha256}\n` },
    { bytes: 0 }, { bytes: -1 }, { bytes: 0.5 }, { bytes: Infinity }, { profileId: "" },
  ]) {
    const report = { ...archive, ...invalid };
    assert.deepEqual(moveVerify({ ...facts, source: report, target: report }), {
      verdict: "hold", pcCopy: "keep", reason: "invalid-facts",
    });
  }
});

test("missing move facts hold and keep the PC copy", () => {
  for (const incomplete of [
    { ...facts, source: undefined },
    { ...facts, target: { ...archive, sha256: undefined } },
    { ...facts, source: { ...archive, sealed: undefined } },
    { ...facts, testOpen: undefined },
    { ...facts, profileBusy: undefined },
    { ...facts, triesSoFar: undefined },
  ]) {
    // @ts-expect-error The reports represent incomplete runtime input from an untyped caller.
    const result = moveVerify(incomplete);
    assert.deepEqual(result, { verdict: "hold", pcCopy: "keep", reason: "invalid-facts" });
  }
});

test("invalid attempt counts hold even when the archives match", () => {
  for (const override of [{ triesSoFar: -1 }, { triesSoFar: NaN }, { maxTries: 0 }, { maxTries: 1.5 }]) {
    assert.deepEqual(moveVerify({ ...facts, ...override }), {
      verdict: "hold", pcCopy: "keep", reason: "invalid-facts",
    });
  }
});

test("a running job holds the move even when the VPS copy is verified", () => {
  assert.deepEqual(moveVerify({ ...facts, profileBusy: true }), {
    verdict: "hold", pcCopy: "keep", reason: "profile-busy",
  });
});
