import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeDecision, pauseRequested } from "../src/pomelo/merge-gate.js";

test("merge is allowed when all required checks pass and merging is unpaused", () => {
  const result = mergeDecision({
    paused: false,
    required: ["test", "typecheck"],
    checks: [{ name: "test", state: "passed" }, { name: "typecheck", state: "passed" }],
  });
  assert.equal(result.merge, true);
});

test("a pause blocks merging even when every required check passes", () => {
  const result = mergeDecision({
    paused: true,
    required: ["test"],
    checks: [{ name: "test", state: "passed" }],
  });
  assert.deepEqual(result, { merge: false, reason: "paused" });
});

test("a failed required check blocks merging and is named in the reason", () => {
  const result = mergeDecision({
    paused: false,
    required: ["typecheck", "unit-tests"],
    checks: [{ name: "typecheck", state: "passed" }, { name: "unit-tests", state: "failed" }],
  });
  assert.equal(result.merge, false);
  assert.match(result.reason, /unit-tests/);
});

test("a missing required check blocks merging", () => {
  const result = mergeDecision({
    paused: false,
    required: ["test", "typecheck"],
    checks: [{ name: "test", state: "passed" }],
  });
  assert.equal(result.merge, false);
});

test("a pending required check blocks merging", () => {
  const result = mergeDecision({
    paused: false,
    required: ["test"],
    checks: [{ name: "test", state: "pending" }],
  });
  assert.equal(result.merge, false);
});

test("an empty required-check list blocks merging", () => {
  const result = mergeDecision({
    paused: false,
    required: [],
    checks: [{ name: "test", state: "passed" }],
  });
  assert.equal(result.merge, false);
});

test("a failing optional check does not block merging", () => {
  const result = mergeDecision({
    paused: false,
    required: ["test"],
    checks: [{ name: "lint", state: "failed" }, { name: "test", state: "passed" }],
  });
  assert.equal(result.merge, true);
});

test("pauseRequested detects PAUSE_AUTOMERGE in the supplied root", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pomelo-merge-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(pauseRequested(root), false);
  writeFileSync(join(root, "PAUSE_AUTOMERGE"), "");
  assert.equal(pauseRequested(root), true);
});
