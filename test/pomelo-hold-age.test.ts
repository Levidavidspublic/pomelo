import assert from "node:assert/strict";
import test from "node:test";
import { holdAge } from "../src/pomelo/browser/hold-age.js";

const minute = 60_000;
const hour = 60 * minute;
const now = 1_000_000_000;
const job = Object.freeze({ state: "waiting", heldAt: now, holdReason: "vault_locked" } as const);
const atAge = (age: number) => ({ job, now: now + age });

test("a waiting job is due for a reminder at 30 minutes", () => {
  for (const age of [0, 30 * minute - 1]) {
    assert.equal(holdAge(atAge(age)).action, "wait");
  }
  for (const age of [30 * minute, 31 * minute]) {
    const result = holdAge(atAge(age));
    assert.equal(result.action, "remind");
    assert.equal(result.mustReread, false);
  }
});

test("a recorded reminder prevents another reminder", () => {
  const input = atAge(31 * minute);
  assert.equal(holdAge({ ...input, job: { ...job, remindedAt: now + 30 * minute } }).action, "wait");
  assert.equal(holdAge({ now: 31 * minute, job: { ...job, heldAt: 0, remindedAt: 0 } }).action, "wait");
});

test("at six hours the job can free the profile and must reread before continuing", () => {
  const remindedJob = Object.freeze({ ...job, remindedAt: now + 30 * minute });
  assert.equal(holdAge({ ...atAge(6 * hour - 1), job: remindedJob }).action, "wait");

  for (const age of [6 * hour, 7 * hour]) {
    for (const waitingJob of [job, remindedJob]) {
      const result = holdAge({ ...atAge(age), job: waitingJob });
      assert.equal(result.action, "park");
      assert.equal(result.mustReread, true);
      assert.match(result.reason, /Read the page again before continuing\./);
      assert.equal(waitingJob.state, "waiting");
    }
  }
});

test("a fill or import in progress keeps the profile at any hold age", () => {
  for (const progress of [{ midFill: true }, { midImport: true }]) {
    for (const age of [0, 31 * minute, 7 * hour]) {
      const result = holdAge({ ...atAge(age), job: { ...job, ...progress } });
      assert.equal(result.action, "keep");
      assert.equal(result.mustReread, false);
    }
  }
});

test("only waiting jobs are eligible", () => {
  for (const state of ["queued", "running", "done", "failed", "cancelled"] as const) {
    const result = holdAge({ ...atAge(7 * hour), job: { ...job, state, midFill: true } });
    assert.equal(result.action, "wait", state);
    assert.match(result.reason, /Only waiting jobs/);
  }
});

test("missing, invalid and future hold times get a plain reason to wait", () => {
  const missing = holdAge({ now, job: { state: job.state, holdReason: job.holdReason } });
  assert.equal(missing.action, "wait");
  assert.match(missing.reason, /missing/);

  for (const heldAt of [String(now) as unknown as number, NaN, Infinity, -1]) {
    const result = holdAge({ now, job: { ...job, heldAt, midImport: true } });
    assert.equal(result.action, "wait");
    assert.match(result.reason, /invalid/);
  }

  const future = holdAge({ now, job: { ...job, heldAt: now + 1 } });
  assert.equal(future.action, "wait");
  assert.match(future.reason, /future/);
});

test("an invalid clock gets a plain reason to wait", () => {
  for (const invalidNow of [NaN, Infinity, -Infinity, -1, String(now) as unknown as number]) {
    const result = holdAge({ job, now: invalidNow });
    assert.equal(result.action, "wait");
    assert.match(result.reason, /clock reading is invalid/);
  }
});

test("custom limits are honored independently", () => {
  const limits = Object.freeze({ remindAfterMs: 5 * minute, parkAfterMs: 10 * minute });
  assert.equal(holdAge({ ...atAge(5 * minute - 1), limits }).action, "wait");
  assert.equal(holdAge({ ...atAge(5 * minute), limits }).action, "remind");
  assert.equal(holdAge({ ...atAge(10 * minute), limits }).action, "park");
  assert.equal(holdAge({ ...atAge(5 * minute), limits: { parkAfterMs: limits.parkAfterMs } }).action, "wait");
  assert.equal(holdAge({ ...atAge(6 * hour), limits: { remindAfterMs: limits.remindAfterMs } }).action, "park");
});

test("invalid limits fall back to their respective defaults", () => {
  for (const invalidLimit of [0, -1, NaN, Infinity]) {
    const remindFallback = { remindAfterMs: invalidLimit, parkAfterMs: hour };
    assert.equal(holdAge({ ...atAge(30 * minute - 1), limits: remindFallback }).action, "wait");
    assert.equal(holdAge({ ...atAge(30 * minute), limits: remindFallback }).action, "remind");
    assert.equal(holdAge({ ...atAge(hour), limits: remindFallback }).action, "park");

    const parkFallback = { remindAfterMs: minute, parkAfterMs: invalidLimit };
    assert.equal(holdAge({ ...atAge(minute), limits: parkFallback }).action, "remind");
    assert.equal(holdAge({ ...atAge(6 * hour - 1), limits: parkFallback }).action, "remind");
    assert.equal(holdAge({ ...atAge(6 * hour), limits: parkFallback }).action, "park");
  }
});

test("every decision uses a fixed sentence and an allowed action", () => {
  const actions = new Set(["wait", "remind", "park", "keep"]);
  const reasons = new Set([
    "Only waiting jobs are checked for hold age.",
    "The clock reading is invalid.",
    "The hold time is missing.",
    "The hold time is invalid.",
    "The hold time is in the future.",
    "The job needs the profile to finish a fill or import.",
    "The job can free the profile and keep waiting. Read the page again before continuing.",
    "Amit has already been reminded.",
    "A reminder for Amit is due.",
    "The job has not been waiting long enough for a reminder.",
  ]);

  for (const holdReason of ["vault_locked", "cloud_unreachable", "import_partial", "captcha", "arbitrary text"]) {
    const heldJob = { ...job, holdReason };
    for (const age of [NaN, -1, 0, 31 * minute, 7 * hour]) {
      for (const candidate of [
        heldJob,
        { ...heldJob, state: "running" } as const,
        { ...heldJob, heldAt: undefined },
        { ...heldJob, heldAt: NaN },
        { ...heldJob, remindedAt: now },
        { ...heldJob, midFill: true },
        { ...heldJob, midImport: true },
      ]) {
        const result = holdAge({ job: candidate, now: now + age });
        assert.ok(actions.has(result.action), result.action);
        assert.ok(reasons.has(result.reason), result.reason);
        assert.equal(result.mustReread, result.action === "park");
      }
    }
  }
});
