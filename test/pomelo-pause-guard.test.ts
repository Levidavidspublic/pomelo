import assert from "node:assert/strict";
import test from "node:test";
import { checkPauseFile } from "../src/pomelo/pause-guard.js";

test("allows a PR with unrelated changes", () => {
  assert.deepEqual(checkPauseFile([
    { path: "src/pomelo/example.ts", status: "modified" },
    { path: "docs/new.md", status: "renamed", oldPath: "docs/old.md" },
  ]), { ok: true, findings: [] });
});

for (const status of ["added", "deleted", "modified"] as const) {
  test(`reports when the root pause file is ${status}`, () => {
    const result = checkPauseFile([{ path: "PAUSE_AUTOMERGE", status }]);

    assert.equal(result.ok, false);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].path, "PAUSE_AUTOMERGE");
    assert.equal(result.findings[0].status, status);
    assert.match(result.findings[0].reason, /only Amit.*auto-merge/i);
  });
}

test("reports the pause file as the source of a rename away", () => {
  const result = checkPauseFile([
    { path: "docs/pause.md", status: "renamed", oldPath: "PAUSE_AUTOMERGE" },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "PAUSE_AUTOMERGE");
  assert.equal(result.findings[0].status, "renamed");
});

test("reports the pause file as the destination of a rename into place", () => {
  const result = checkPauseFile([
    { path: "PAUSE_AUTOMERGE", status: "renamed", oldPath: "docs/pause.md" },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "PAUSE_AUTOMERGE");
  assert.equal(result.findings[0].status, "renamed");
});

test("reports case variants and subfolder copies in the same PR", () => {
  const result = checkPauseFile([
    { path: "pause_automerge", status: "added" },
    { path: "docs/ops/PAUSE_AUTOMERGE", status: "added" },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path, status }) => ({ path, status })), [
    { path: "pause_automerge", status: "added" },
    { path: "docs/ops/PAUSE_AUTOMERGE", status: "added" },
  ]);
});

test("normalises backslashes in both change paths and rename sources", () => {
  const result = checkPauseFile([
    { path: "docs\\PAUSE_AUTOMERGE", status: "modified" },
    { path: "docs/pause.md", status: "renamed", oldPath: "docs\\pause_automerge" },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path, status }) => ({ path, status })), [
    { path: "docs/PAUSE_AUTOMERGE", status: "modified" },
    { path: "docs/pause_automerge", status: "renamed" },
  ]);
});

test("allows an empty change list", () => {
  assert.deepEqual(checkPauseFile([]), { ok: true, findings: [] });
});

test("allows longer names that contain PAUSE_AUTOMERGE", () => {
  assert.deepEqual(checkPauseFile([
    { path: "docs/PAUSE_AUTOMERGE-notes.md", status: "added" },
  ]), { ok: true, findings: [] });
});
