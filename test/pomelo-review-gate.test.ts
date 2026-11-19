import assert from "node:assert/strict";
import test from "node:test";
import { reviewGate, type ReviewGateInput } from "../src/pomelo/review-gate.js";

const headCommitId = "current";
const approved = { status: "approved", reviewedCommitId: headCommitId, openComments: 0 } as const;
const fallback = { reviewer: "backup reviewer", status: "approved", reviewedCommitId: headCommitId } as const;
const off = { status: "off", openComments: 0 } as const;

test("CodeRabbit approval on the head passes with zero open comments", () => {
  assert.deepEqual(reviewGate({ headCommitId, codeRabbit: approved }), {
    verdict: "pass", reason: "coderabbit_approved",
  });
});

test("CodeRabbit changes requested fails even with fallback approval", () => {
  const codeRabbit = { ...approved, status: "changes_requested" } as const;
  assert.deepEqual(reviewGate({ headCommitId, codeRabbit, fallback }), {
    verdict: "fail", reason: "changes_requested",
  });
});

test("CodeRabbit reviews of an older commit wait", () => {
  for (const status of ["approved", "changes_requested"] as const) {
    const codeRabbit = { ...approved, status, reviewedCommitId: "older" };
    assert.deepEqual(reviewGate({ headCommitId, codeRabbit, fallback }), {
      verdict: "wait", reason: "stale_review",
    });
  }
});

test("pending CodeRabbit waits even with fallback approval", () => {
  const codeRabbit = { status: "pending", openComments: 0 } as const;
  assert.deepEqual(reviewGate({ headCommitId, codeRabbit, fallback }), {
    verdict: "wait", reason: "coderabbit_pending",
  });
});

test("CodeRabbit off or unavailable uses a current fallback approval and waits without one", () => {
  for (const status of ["off", "unavailable"] as const) {
    const codeRabbit = { status, openComments: 0 };
    assert.deepEqual(reviewGate({ headCommitId, codeRabbit, fallback }), {
      verdict: "pass", reason: "fallback_approved",
    });
    assert.deepEqual(reviewGate({ headCommitId, codeRabbit }), {
      verdict: "wait", reason: "no_review",
    });
  }
  const codeRabbit = { ...off, reviewedCommitId: "older" };
  assert.deepEqual(reviewGate({ headCommitId, codeRabbit, fallback }), {
    verdict: "pass", reason: "fallback_approved",
  });
});

test("unknown or missing required input cannot pass", () => {
  const invalidInputs: unknown[] = [
    undefined,
    null,
    { codeRabbit: approved },
    { headCommitId, fallback },
    { headCommitId, codeRabbit: { ...approved, status: "unknown" }, fallback },
    { headCommitId, codeRabbit: { status: "approved", openComments: 0 } },
    { headCommitId, codeRabbit: { status: "approved", reviewedCommitId: headCommitId } },
    { headCommitId, codeRabbit: { ...approved, openComments: -1 } },
    { headCommitId, codeRabbit: { status: "off" }, fallback },
    { headCommitId, codeRabbit: off, fallback: { ...fallback, status: "pending" } },
    { headCommitId, codeRabbit: off, fallback: { ...fallback, reviewer: "" } },
    { headCommitId, codeRabbit: off, fallback: { reviewer: fallback.reviewer, status: "approved" } },
  ];
  for (const input of invalidInputs) {
    assert.deepEqual(reviewGate(input as ReviewGateInput), { verdict: "wait", reason: "bad_input" });
  }
});

test("fallback approval on an older commit waits", () => {
  const staleFallback = { ...fallback, reviewedCommitId: "older" };
  assert.deepEqual(reviewGate({ headCommitId, codeRabbit: off, fallback: staleFallback }), {
    verdict: "wait", reason: "stale_review",
  });
});

test("fallback changes requested on the head fails", () => {
  const requestedChanges = { ...fallback, status: "changes_requested" } as const;
  assert.deepEqual(reviewGate({ headCommitId, codeRabbit: off, fallback: requestedChanges }), {
    verdict: "fail", reason: "changes_requested",
  });
});

test("one open CodeRabbit comment on the head blocks either approval", () => {
  for (const status of ["approved", "pending", "unavailable"] as const) {
    const codeRabbit = { ...approved, status, openComments: 1 };
    assert.deepEqual(reviewGate({ headCommitId, codeRabbit, fallback }), {
      verdict: "fail", reason: "open_comments",
    });
  }
});
