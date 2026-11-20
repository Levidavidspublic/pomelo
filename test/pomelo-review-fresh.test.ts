import assert from "node:assert/strict";
import test from "node:test";
import { reviewFreshness, type ReviewFreshnessInput } from "../src/pomelo/review-fresh.js";

const headSha = "a".repeat(40);
const olderSha = "b".repeat(40);
const approval = {
  reviewer: "reviewer-one",
  state: "APPROVED",
  commitSha: headSha,
  submittedAt: "2026-11-18T09:00:00Z",
} as const;
const staleApproval = { ...approval, reviewer: "reviewer-two", commitSha: olderSha };
const request = { ...approval, state: "CHANGES_REQUESTED", submittedAt: "2026-11-18T10:00:00Z" } as const;

test("an approval on the head is fresh in plain data and JSON", () => {
  const input: ReviewFreshnessInput = { headSha, reviews: [approval] };
  const result = reviewFreshness(input);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "fresh");
  assert.deepEqual(reviewFreshness(JSON.stringify(input)), result);
});

test("a push makes the previous approval stale and names both SHAs", () => {
  const result = reviewFreshness({ headSha, reviews: [staleApproval] });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "stale");
  assert.ok(result.reasons.some((reason) => reason.includes(olderSha) && reason.includes(headSha)));
});

test("an empty review list gives none", () => {
  const result = reviewFreshness({ headSha, reviews: [] });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "none");
});

test("a later change request from the same reviewer overrides approval", () => {
  const result = reviewFreshness({ headSha, reviews: [approval, request] });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "none");
  assert.ok(result.reasons.some((reason) => /reviewer-one.*open change request/i.test(reason)));
});

test("dismissed and comment-only reviews give no approval", () => {
  for (const state of ["DISMISSED", "COMMENTED"] as const) {
    const result = reviewFreshness({ headSha, reviews: [{ ...approval, state }] });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "none");
  }
});

test("a fresh approval can pass with a stale one, while an open change request blocks both", () => {
  const reviews = [staleApproval, approval];
  assert.equal(reviewFreshness({ headSha, reviews }).verdict, "fresh");

  const otherRequest = { ...request, reviewer: staleApproval.reviewer, commitSha: olderSha };
  const comment = { ...otherRequest, state: "COMMENTED", submittedAt: "2026-11-18T11:00:00Z" };
  const result = reviewFreshness({ headSha, reviews: [...reviews, otherRequest, comment] });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "none");
  assert.ok(result.reasons.some((reason) => /reviewer-two.*open change request/i.test(reason)));
});

test("a later head approval clears the same reviewer's change request", () => {
  const resolution = { ...approval, state: "approved", submittedAt: "2026-11-18T09:30:00-01:00" };
  const result = reviewFreshness({ headSha, reviews: [resolution, { ...request, state: "changes requested" }] });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "fresh");
});

test("a dismissal clears a request while another reviewer's approval supplies freshness", () => {
  const dismissal = { ...request, state: "DISMISSED", submittedAt: "2026-11-18T11:00:00Z" };
  const result = reviewFreshness({
    headSha,
    reviews: [request, dismissal, { ...approval, reviewer: "reviewer-two" }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "fresh");
});

test("submission order is independent of array order and input is left intact", () => {
  const reviews = Object.freeze([Object.freeze(request), Object.freeze(approval), Object.freeze(staleApproval)]);
  const result = reviewFreshness(Object.freeze({ headSha, reviews }));
  assert.equal(result.ok, false);
  assert.deepEqual(reviewFreshness({ headSha, reviews: [...reviews].reverse() }), result);
  assert.deepEqual(reviews, [request, approval, staleApproval]);
});

test("a change request wins over an approval at the same instant", () => {
  const tiedRequest = { ...request, submittedAt: "2026-11-18T08:00:00-01:00" };
  const result = reviewFreshness({ headSha, reviews: [tiedRequest, approval] });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "none");
  assert.deepEqual(reviewFreshness({ headSha, reviews: [approval, tiedRequest] }), result);
});

test("conflicting approval SHAs at the same instant cannot establish freshness", () => {
  const olderApproval = { ...approval, commitSha: olderSha };
  const result = reviewFreshness({ headSha, reviews: [olderApproval, approval] });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "stale");
  assert.deepEqual(reviewFreshness({ headSha, reviews: [approval, olderApproval] }), result);
});

test("invalid JSON and malformed data never pass", () => {
  for (const input of [
    "{",
    "   ",
    "null",
    "{}",
    { headSha: "", reviews: [approval] },
    { headSha, reviews: null },
    { headSha, reviews: [approval, null] },
    { headSha, reviews: [{ ...approval, reviewer: "" }] },
    { headSha, reviews: [{ ...approval, state: "UNKNOWN" }] },
    { headSha, reviews: [{ ...approval, commitSha: undefined }] },
    { headSha, reviews: [{ ...approval, submittedAt: "2026-02-30T09:00:00Z" }] },
    { headSha, reviews: [{ ...approval, submittedAt: "2026-11-18T09:00:00" }] },
  ]) {
    const result = reviewFreshness(input);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "bad-input");
    assert.ok(result.reasons.length > 0);
  }
});
