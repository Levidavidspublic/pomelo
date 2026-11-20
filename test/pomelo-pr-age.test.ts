import assert from "node:assert/strict";
import test from "node:test";
import { stalePrs, type PrAgeInput } from "../src/pomelo/pr-age.js";

const hour = 60 * 60 * 1_000;
const now = 12 * hour;
const oldPr: PrAgeInput = {
  ticket: 12,
  openedAt: now - 7 * hour,
  lastPushAt: now - 3 * hour,
  checkState: "passed",
  reviewState: "approved",
  behindBase: false,
  draft: false,
  hold: false,
};

test("a fresh PR stays out of the report even with a failing check", () => {
  const fresh = { ...oldPr, openedAt: now - hour, lastPushAt: now - hour, checkState: "failed" } as const;
  assert.deepEqual(stalePrs([fresh], now), []);
});

test("an old PR with failing checks reports checks_failing before lower-priority reasons", () => {
  const pr = { ...oldPr, checkState: "failed", reviewState: "pending", behindBase: true, draft: true } as const;
  assert.deepEqual(stalePrs([pr], now), [{ ticket: 12, reason: "checks_failing" }]);
});

test("running checks get two hours from the last push before they take priority", () => {
  const pr = { ...oldPr, checkState: "running", reviewState: "pending", behindBase: true } as const;
  assert.deepEqual(stalePrs([{ ...pr, lastPushAt: now - 2 * hour }], now), []);
  assert.deepEqual(stalePrs([{ ...pr, lastPushAt: now - 2 * hour - 1 }], now), [
    { ticket: 12, reason: "checks_running_too_long" },
  ]);
  assert.deepEqual(stalePrs([{ ...pr, openedAt: now - 3 * hour }], now), [
    { ticket: 12, reason: "checks_running_too_long" },
  ]);
});

test("passing checks without an approval report awaiting_review before behind_base", () => {
  for (const reviewState of ["pending", "changes_requested"] as const) {
    assert.deepEqual(stalePrs([{ ...oldPr, reviewState, behindBase: true }], now), [
      { ticket: 12, reason: "awaiting_review" },
    ]);
  }
});

test("a passing, approved PR that is behind its base reports behind_base before parked", () => {
  assert.deepEqual(stalePrs([{ ...oldPr, behindBase: true, hold: true }], now), [
    { ticket: 12, reason: "behind_base" },
  ]);
});

test("a draft or a PR on hold reports parked", () => {
  for (const flags of [{ draft: true }, { hold: true }]) {
    assert.deepEqual(stalePrs([{ ...oldPr, ...flags }], now), [{ ticket: 12, reason: "parked" }]);
  }
});

test("a ready PR reports ready_not_merged once it has been open more than six hours", () => {
  const pr = { ...oldPr, openedAt: now - 6 * hour, lastPushAt: now - 1 };
  assert.deepEqual(stalePrs([pr], now), []);
  assert.deepEqual(stalePrs([{ ...pr, openedAt: pr.openedAt - 1 }], now), [
    { ticket: 12, reason: "ready_not_merged" },
  ]);
});

test("callers can override either limit independently", () => {
  const running = { ...oldPr, ticket: 2, checkState: "running" } as const;
  assert.deepEqual(stalePrs([oldPr, running], now, { runningChecksMs: 4 * hour }), [
    { ticket: 12, reason: "ready_not_merged" },
  ]);
  assert.deepEqual(stalePrs([oldPr, running], now, { generalMs: 8 * hour }), [
    { ticket: 2, reason: "checks_running_too_long" },
  ]);
});

test("the report sorts numerically by ticket without changing the inputs", () => {
  const prs = Object.freeze([Object.freeze(oldPr), Object.freeze({ ...oldPr, ticket: 2 }), Object.freeze({ ...oldPr, ticket: 9 })]);
  assert.deepEqual(stalePrs(prs, now), [
    { ticket: 2, reason: "ready_not_merged" },
    { ticket: 9, reason: "ready_not_merged" },
    { ticket: 12, reason: "ready_not_merged" },
  ]);
  assert.deepEqual(prs.map((pr) => pr.ticket), [12, 2, 9]);
});

test("an empty list returns an empty report", () => {
  assert.deepEqual(stalePrs([], now), []);
});

test("missing or non-finite PR timestamps report bad_input", () => {
  const { openedAt, lastPushAt, ...withoutTimes } = oldPr;
  const prs = [
    { ...withoutTimes, ticket: 4, lastPushAt },
    { ...withoutTimes, ticket: 3, openedAt },
    { ...oldPr, ticket: 2, openedAt: NaN },
    { ...oldPr, ticket: 1, openedAt: now, lastPushAt: Infinity },
  ];
  assert.deepEqual(stalePrs(prs, now), [
    { ticket: 1, reason: "bad_input" },
    { ticket: 2, reason: "bad_input" },
    { ticket: 3, reason: "bad_input" },
    { ticket: 4, reason: "bad_input" },
  ]);
});

test("a non-finite supplied current time reports bad_input", () => {
  assert.deepEqual(stalePrs([oldPr], NaN), [{ ticket: 12, reason: "bad_input" }]);
});
