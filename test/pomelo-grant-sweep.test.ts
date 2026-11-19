import assert from "node:assert/strict";
import test from "node:test";
import { grantSweep, type SweepGrant } from "../src/pomelo/grant-sweep.js";

const now = 1_000;

function grant(id: string, jobId: string, overrides: Partial<SweepGrant> = {}): SweepGrant {
  return {
    id,
    refId: "fixture-ref",
    origin: "https://example.test",
    frame: "main",
    jobId,
    expiresAt: now + 1,
    revoked: false,
    ...overrides,
  };
}

test("done, failed and cancelled jobs revoke their live grants", () => {
  for (const state of ["done", "failed", "cancelled"] as const) {
    assert.deepEqual(grantSweep([grant("a", "job")], [{ id: "job", state }], now), [
      { grantId: "a", reason: "job-ended" },
    ]);
  }
});

test("queued, running and waiting jobs keep their live grants", () => {
  for (const state of ["queued", "running", "waiting"] as const) {
    assert.deepEqual(grantSweep([grant("a", "job")], [{ id: "job", state }], now), []);
  }
});

test("grants expire at their deadline even when their jobs are still running or waiting", () => {
  const grants = [
    grant("a", "running", { expiresAt: now - 1 }),
    grant("b", "waiting", { expiresAt: now }),
  ];
  const jobs = [{ id: "running", state: "running" }, { id: "waiting", state: "waiting" }] as const;
  assert.deepEqual(grantSweep(grants, jobs, now), [
    { grantId: "a", reason: "expired" },
    { grantId: "b", reason: "expired" },
  ]);
});

test("grants for missing jobs are revoked, even if they already expired", () => {
  const grants = [grant("a", "missing"), grant("b", "missing", { expiresAt: now - 1 })];
  assert.deepEqual(grantSweep(grants, [{ id: "other", state: "running" }], now), [
    { grantId: "a", reason: "job-missing" },
    { grantId: "b", reason: "job-missing" },
  ]);
});

test("already revoked grants are left alone", () => {
  const revoked = { revoked: true, expiresAt: now - 1 };
  const grants = [grant("a", "done", revoked), grant("b", "missing", revoked)];
  assert.deepEqual(grantSweep(grants, [{ id: "done", state: "done" }], now), []);
});

test("all grants for an ended job are returned in ID order, with job-ended taking precedence over expiry", () => {
  const grants = [grant("z", "job"), grant("a", "job", { expiresAt: now - 1 })];
  assert.deepEqual(grantSweep(grants, [{ id: "job", state: "done" }], now), [
    { grantId: "a", reason: "job-ended" },
    { grantId: "z", reason: "job-ended" },
  ]);
});

test("the sweep returns only IDs and reasons and leaves both inputs unchanged", () => {
  const canary = "sweep-fixture-canary";
  const grants = Object.freeze([
    Object.freeze(grant("a", "done", { origin: `https://${canary}.example.test`, refId: canary })),
    Object.freeze(grant("b", "running")),
  ]);
  const jobs = Object.freeze([
    Object.freeze({ id: "done", state: "done" } as const),
    Object.freeze({ id: "running", state: "running" } as const),
  ]);

  const result = grantSweep(grants, jobs, now);
  assert.deepEqual(result, [{ grantId: "a", reason: "job-ended" }]);
  assert.equal(JSON.stringify(result).includes(canary), false);
});
