import assert from "node:assert/strict";
import test from "node:test";
import { decideApproval, useApproval, type ApprovalRequest, type ApprovalStep } from "../src/pomelo/approval-rule.js";

const now = 1_000;
const step: ApprovalStep = Object.freeze({
  action: "fill",
  origin: "https://bank.example",
  accountLabel: "Example account",
  jobId: "job-1",
});
const pending: ApprovalRequest = Object.freeze({ ...step, status: "pending", expiresAt: now + 100 });
const approved: ApprovalRequest = Object.freeze({ ...pending, status: "approved" });
const yes = { by: "user", approve: true } as const;

test("only a user can approve a pending request", () => {
  for (const by of ["agent", "subagent"] as const) {
    for (const approve of [true, false]) {
      assert.deepEqual(decideApproval(pending, { by, approve }, now), {
        ok: false, reason: "not-user", request: pending,
      });
    }
  }

  assert.deepEqual(decideApproval(pending, yes, now), { ok: true, request: approved });
  assert.equal(pending.status, "pending");
});

test("an approval cannot be decided twice", () => {
  const result = decideApproval(pending, yes, now);
  assert.ok(result.ok);
  assert.deepEqual(decideApproval(result.request, { by: "user", approve: false }, now), {
    ok: false, reason: "not-pending", request: approved,
  });
});

test("a denial is retained and can never authorize a step", () => {
  const denied = { ...pending, status: "denied" };
  const result = decideApproval(pending, { by: "user", approve: false }, now);
  assert.ok(result.ok);
  assert.deepEqual(result.request, denied);
  assert.deepEqual(decideApproval(result.request, yes, now), {
    ok: false, reason: "not-pending", request: denied,
  });
  assert.deepEqual(useApproval(result.request, step, now), { ok: false, reason: "denied" });
  assert.deepEqual(useApproval(result.request, step, pending.expiresAt), { ok: false, reason: "denied" });
});

test("a pending request expires at its deadline and stays expired", () => {
  const result = decideApproval(pending, yes, pending.expiresAt);
  assert.deepEqual(result, {
    ok: false, reason: "expired", request: { ...pending, status: "expired" },
  });
  assert.deepEqual(decideApproval(result.request, yes, now), result);
  assert.deepEqual(useApproval(result.request, step, now), { ok: false, reason: "expired" });
  assert.equal(pending.status, "pending");
});

test("an approval can be used once before its deadline for either supported action", () => {
  for (const action of ["fill", "import"] as const) {
    const request = Object.freeze({ ...approved, action });
    const result = useApproval(request, { ...step, action }, request.expiresAt - 1);
    assert.ok(result.ok);
    assert.deepEqual(result.request, { ...request, status: "used" });
    assert.deepEqual(useApproval(result.request, { ...step, action }, now), {
      ok: false, reason: "already-used",
    });
    assert.equal(request.status, "approved");
  }
});

test("use refuses pending or expired requests", () => {
  assert.deepEqual(useApproval(pending, step, now), { ok: false, reason: "not-approved" });
  for (const request of [pending, approved]) {
    for (const time of [request.expiresAt, request.expiresAt + 1]) {
      assert.deepEqual(useApproval(request, step, time), { ok: false, reason: "expired" });
    }
  }
});

test("a non-finite clock or deadline cannot authorize a step", () => {
  for (const time of [NaN, -Infinity, Infinity]) {
    assert.equal(decideApproval(pending, yes, time).ok, false);
    assert.equal(decideApproval({ ...pending, expiresAt: time }, yes, now).ok, false);
    assert.deepEqual(useApproval(approved, step, time), { ok: false, reason: "expired" });
    assert.deepEqual(useApproval({ ...approved, expiresAt: time }, step, now), { ok: false, reason: "expired" });
  }
});

test("origin comparison allows host casing and the explicit default port", () => {
  assert.deepEqual(useApproval(approved, { ...step, origin: "https://BANK.example:443/sign-in" }, now), {
    ok: true, request: { ...approved, status: "used" },
  });
});

test("origin comparison rejects look-alikes, subdomains, different schemes or ports, and invalid origins", () => {
  assert.deepEqual(useApproval({ ...approved, origin: "https://bank.example.evil.test" }, step, now), {
    ok: false, reason: "origin-mismatch",
  });
  for (const origin of ["https://sub.bank.example", "http://bank.example", "https://bank.example:8443", "not a URL", "about:blank"]) {
    assert.deepEqual(useApproval(approved, { ...step, origin }, now), { ok: false, reason: "origin-mismatch" });
  }
  for (const origin of ["not a URL", "about:blank"]) {
    assert.deepEqual(useApproval({ ...approved, origin }, { ...step, origin }, now), {
      ok: false, reason: "origin-mismatch",
    });
  }
});

test("action, account label and job must match exactly", () => {
  assert.deepEqual(useApproval(approved, { ...step, action: "import" }, now), { ok: false, reason: "action-mismatch" });
  assert.deepEqual(useApproval(approved, { ...step, accountLabel: "example account" }, now), { ok: false, reason: "account-mismatch" });
  assert.deepEqual(useApproval(approved, { ...step, jobId: "job-2" }, now), { ok: false, reason: "job-mismatch" });
});

test("results omit extra input fields on success and refusal", () => {
  const canary = "fake-approval-canary-361";
  const extra = { value: canary, secret: canary, password: canary, cookie: canary, extra: { canary } };
  const request = Object.freeze({ ...pending, ...extra });
  const approval = Object.freeze({ ...approved, ...extra });
  const proposedStep = Object.freeze({ ...step, ...extra });
  const results = [
    decideApproval(request, { ...yes, ...extra }, now),
    decideApproval(request, { by: "agent", approve: true }, now),
    decideApproval(request, yes, request.expiresAt),
    decideApproval(approval, yes, now),
    useApproval(approval, proposedStep, now),
    useApproval(approval, { ...proposedStep, origin: "https://other.example" }, now),
  ];
  for (const result of results) {
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /"(?:value|secret|password|cookie)":/);
    assert.ok(!serialized.includes(canary));
  }
});
