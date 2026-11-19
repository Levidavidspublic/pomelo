import assert from "node:assert/strict";
import test from "node:test";
import { heldJobNext, RETRY_WAITS_MS } from "../src/pomelo/browser/job-retry.js";

const job = {
  reason: "vps_unreachable",
  tries: 0,
  lastTriedAt: 1_000_000,
  now: 1_000_000,
  pendingStep: "read",
  amitPressedRetry: false,
} as const;

test("an unreachable VPS backs off for 30 seconds, 2 minutes and 10 minutes", () => {
  const waits = [30_000, 120_000, 600_000];
  assert.deepEqual(RETRY_WAITS_MS, waits);

  for (const [tries, delay] of waits.entries()) {
    const retryAt = job.lastTriedAt + delay;
    const early = heldJobNext({ ...job, tries, now: retryAt - 1 });
    assert.equal(early.action, "wait");
    assert.equal(early.retryAt, retryAt);

    for (const now of [retryAt, retryAt + 1]) {
      const due = heldJobNext({ ...job, tries, now });
      assert.equal(due.action, "retry");
      assert.equal(due.retryAt, retryAt);
    }
  }

  const exhausted = heldJobNext({ ...job, tries: 3, now: job.now + 600_000 });
  assert.equal(exhausted.action, "ask_amit");
  assert.equal(exhausted.retryAt, undefined);
});

test("Amit can retry an unreachable VPS during backoff or after the retry limit", () => {
  for (const tries of [0, 3]) {
    const result = heldJobNext({ ...job, tries, pendingStep: "navigate", amitPressedRetry: true });
    assert.equal(result.action, "retry");
    assert.equal(result.retryAt, job.now);
  }
});

test("a CAPTCHA always needs Amit, including after a retry press", () => {
  for (const amitPressedRetry of [false, true]) {
    const result = heldJobNext({ ...job, reason: "captcha", pendingStep: "fill", amitPressedRetry });
    assert.equal(result.action, "ask_amit");
    assert.match(result.why, /CAPTCHA/);
  }
});

test("a locked vault waits for Amit to unlock 1Password and press retry", () => {
  const locked = { ...job, reason: "vault_locked" } as const;
  const waiting = heldJobNext(locked);
  assert.equal(waiting.action, "wait");
  assert.equal(waiting.retryAt, undefined);
  assert.equal(heldJobNext({ ...locked, amitPressedRetry: true }).action, "retry");
});

test("a partial import always needs Amit, including after a retry press", () => {
  for (const amitPressedRetry of [false, true]) {
    const result = heldJobNext({ ...job, reason: "import_partial", amitPressedRetry });
    assert.equal(result.action, "ask_amit");
    assert.match(result.why, /partial import/);
  }
  const pressed = heldJobNext({ ...job, reason: "import_partial", pendingStep: "import", amitPressedRetry: true });
  assert.equal(pressed.action, "ask_amit");
});

test("fill and import steps held for any reason cannot retry automatically", () => {
  for (const reason of ["vps_unreachable", "vault_locked", "captcha", "import_partial"] as const) {
    for (const pendingStep of ["fill", "import"] as const) {
      const result = heldJobNext({ ...job, reason, pendingStep, now: job.now + 30_000 });
      assert.equal(result.action, "ask_amit");
      assert.equal(result.retryAt, undefined);
      assert.match(result.why, reason === "captcha" ? /CAPTCHA/ : /fresh approval/);
    }
  }
});

test("Amit can explicitly retry a fill or import held by the VPS or vault", () => {
  for (const reason of ["vps_unreachable", "vault_locked"] as const) {
    for (const pendingStep of ["fill", "import"] as const) {
      const result = heldJobNext({ ...job, reason, pendingStep, amitPressedRetry: true });
      assert.equal(result.action, "retry");
      assert.equal(result.retryAt, job.now);
    }
  }
});

test("unknown hold reasons and invalid retry counts need Amit even after a retry press", () => {
  const unknown = { ...job, reason: "unsupported_hold_reason", amitPressedRetry: true };
  const result = heldJobNext(unknown as unknown as Parameters<typeof heldJobNext>[0]);
  assert.equal(result.action, "ask_amit");
  assert.doesNotMatch(result.why, /unsupported_hold_reason/);

  for (const tries of [-1, 0.5, NaN]) {
    assert.equal(heldJobNext({ ...job, tries, amitPressedRetry: true }).action, "ask_amit");
  }
});
