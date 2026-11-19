import assert from "node:assert/strict";
import test from "node:test";
import { checkPrHold, type PrHoldInput } from "../src/pomelo/pr-hold.js";

const ready: PrHoldInput = { draft: false, labels: [], reviews: [] };
const request = { reviewer: "reviewer-one", state: "CHANGES_REQUESTED", submittedAt: "2026-11-18T09:00:00Z" } as const;
const later = "2026-11-18T10:00:00Z";

test("a ready PR may auto-merge", () => {
  assert.deepEqual(checkPrHold(ready), { mayAutoMerge: true, reasons: [] });
});

test("a draft PR is held", () => {
  const result = checkPrHold({ ...ready, draft: true });
  assert.equal(result.mayAutoMerge, false);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /draft/i);
});

for (const label of ["do-not-merge", "hold", "needs-amit", "wip", "Do Not Merge", " HOLD ", "Needs Amit", "W I P"]) {
  test(`the hold label ${JSON.stringify(label)} blocks auto-merge`, () => {
    const result = checkPrHold({ ...ready, labels: [label] });
    assert.equal(result.mayAutoMerge, false);
    assert.equal(result.reasons.length, 1);
    assert.ok(result.reasons[0].includes(label.trim()));
  });
}

test("unrelated labels do not block auto-merge", () => {
  assert.deepEqual(checkPrHold({ ...ready, labels: ["holiday", "hold-for-release"] }), {
    mayAutoMerge: true,
    reasons: [],
  });
});

test("an open change request holds the PR and names the reviewer", () => {
  const result = checkPrHold({ ...ready, reviews: [request] });
  assert.equal(result.mayAutoMerge, false);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /reviewer-one/);
});

for (const state of ["APPROVED", "DISMISSED"] as const) {
  test(`a later ${state} review clears the same reviewer's change request`, () => {
    const resolution = Object.freeze({ ...request, state, submittedAt: later });
    const reviews = Object.freeze([resolution, Object.freeze(request)]);
    assert.deepEqual(checkPrHold(Object.freeze({ ...ready, reviews })), { mayAutoMerge: true, reasons: [] });
  });
}

test("review order follows the instant across time zones", () => {
  const approval = { ...request, state: "APPROVED", submittedAt: "2026-11-18T08:30:00-01:00" };
  assert.deepEqual(checkPrHold({ ...ready, reviews: [request, approval] }), { mayAutoMerge: true, reasons: [] });
});

test("a second reviewer's open change request keeps the PR held", () => {
  const result = checkPrHold({
    ...ready,
    reviews: [request, { ...request, reviewer: "reviewer-two" }, { ...request, state: "APPROVED", submittedAt: later }],
  });
  assert.equal(result.mayAutoMerge, false);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /reviewer-two/);
});

test("a comment and an approval at the same time as the request leave it open", () => {
  for (const review of [{ ...request, state: "COMMENTED", submittedAt: later }, { ...request, state: "APPROVED" }]) {
    const result = checkPrHold({ ...ready, reviews: [request, review] });
    assert.equal(result.mayAutoMerge, false);
    assert.match(result.reasons[0], /reviewer-one/);
  }
});

test("each known hold contributes a reason", () => {
  const result = checkPrHold({ draft: true, labels: ["wip", "hold"], reviews: [request] });
  assert.equal(result.mayAutoMerge, false);
  assert.equal(result.reasons.length, 4);
  for (const detail of [/draft/i, /wip/i, /label.*hold/i, /reviewer-one/]) {
    assert.ok(result.reasons.some((reason) => detail.test(reason)));
  }
});

test("missing or malformed PR and review fields hold the PR with a reason", () => {
  const cases = [
    [undefined, /PR/i],
    [{ labels: [], reviews: [] }, /draft/i],
    [{ ...ready, labels: "hold" }, /labels/i],
    [{ ...ready, labels: [undefined] }, /label/i],
    [{ draft: false, labels: [] }, /reviews/i],
    [{ ...ready, reviews: [null] }, /review/i],
    [{ ...ready, reviews: [{ state: "APPROVED", submittedAt: later }] }, /reviewer/i],
    [{ ...ready, reviews: [{ ...request, state: "UNKNOWN" }] }, /reviewer-one/],
    [{ ...ready, reviews: [{ ...request, state: "APPROVED", submittedAt: "not a date" }] }, /reviewer-one/],
    [{ ...ready, reviews: [{ ...request, state: "APPROVED", submittedAt: "2026-02-30T10:00:00Z" }] }, /reviewer-one/],
    [{ ...ready, reviews: [{ reviewer: "reviewer-one", state: "APPROVED" }] }, /reviewer-one/],
  ] as const;

  for (const [pr, detail] of cases) {
    const result = checkPrHold(pr);
    assert.equal(result.mayAutoMerge, false);
    assert.equal(result.reasons.length, 1);
    assert.match(result.reasons[0], detail);
  }
});
