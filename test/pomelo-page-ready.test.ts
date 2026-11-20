import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_WAIT_MS,
  DEFAULT_SETTLE_MS,
  pageReady,
  type PageReadyFacts,
  type PageReadyLimits,
} from "../src/pomelo/browser/page-ready.js";

const limits = { settleMs: 200, maxWaitMs: 2_000 };
const ready = {
  step: "click",
  navigationStartedAt: 1_000,
  domContentLoaded: true,
  loadEventFired: true,
  openRequests: 0,
  lastNetworkActivityAt: 1_300,
  lastLayoutChangeAt: 1_200,
  targetPresent: true,
  targetVisible: true,
  targetEnabled: true,
} as const satisfies PageReadyFacts;
const settleAt = ready.lastNetworkActivityAt + limits.settleMs;
const deadline = ready.navigationStartedAt + limits.maxWaitMs;

test("a read can go at DOM content loaded while the page and target are still loading", () => {
  const reading = {
    ...ready,
    step: "read",
    domContentLoaded: false,
    loadEventFired: false,
    openRequests: 2,
    targetPresent: false,
    targetVisible: false,
    targetEnabled: false,
  } as const;
  assert.equal(pageReady(reading, settleAt, limits).action, "wait");
  assert.deepEqual(pageReady({ ...reading, domContentLoaded: true }, settleAt, limits), {
    action: "go", reason: "page_ready",
  });
});

test("clicks and fills wait for DOM content, the load event and an actionable target", () => {
  for (const step of ["click", "fill"] as const) {
    for (const fact of ["domContentLoaded", "loadEventFired", "targetPresent", "targetVisible", "targetEnabled"] as const) {
      assert.equal(pageReady({ ...ready, step, [fact]: false }, settleAt, limits).action, "wait", fact);
    }
    assert.equal(pageReady({ ...ready, step }, settleAt, limits).action, "go");
  }
});

test("a click can go when the entire network settle window has elapsed", () => {
  assert.equal(pageReady(ready, settleAt - 1, limits).action, "wait");
  assert.deepEqual(pageReady(ready, settleAt, limits), { action: "go", reason: "page_ready" });
  assert.equal(pageReady(ready, settleAt + 1, limits).action, "go");
});

test("a recent layout change delays fills but allows an otherwise ready click", () => {
  const changed = { ...ready, lastLayoutChangeAt: settleAt - 1 };
  assert.equal(pageReady(changed, settleAt, limits).action, "go");
  const fill = { ...changed, step: "fill" } as const;
  assert.equal(pageReady(fill, settleAt, limits).action, "wait");
  assert.equal(pageReady(fill, changed.lastLayoutChangeAt + limits.settleMs, limits).action, "go");
});

test("open requests that never finish wait up to the deadline and then hold", () => {
  const busy = { ...ready, openRequests: 1 };
  assert.equal(pageReady(busy, deadline - 1, limits).action, "wait");
  for (const now of [deadline, deadline + 1]) {
    assert.deepEqual(pageReady(busy, now, limits), { action: "hold", reason: "page_never_settled" });
  }
});

test("a missing target holds at the deadline with its own reason", () => {
  const missing = { ...ready, targetPresent: false, targetVisible: false, targetEnabled: false };
  assert.equal(pageReady(missing, deadline - 1, limits).action, "wait");
  assert.deepEqual(pageReady(missing, deadline, limits), { action: "hold", reason: "target_missing" });
});

test("the deadline also stops unreadable pages and snapshots that look ready too late", () => {
  const reading = { ...ready, step: "read", domContentLoaded: false } as const;
  assert.deepEqual(pageReady(reading, deadline, limits), { action: "hold", reason: "page_never_settled" });
  for (const step of ["read", "click", "fill"] as const) {
    assert.deepEqual(pageReady({ ...ready, step }, deadline + 1, limits), {
      action: "hold", reason: "wait_limit_reached",
    });
  }
});

test("invalid or missing timestamps and limits hold with bad_input", () => {
  const badInput = { action: "hold", reason: "bad_input" };
  for (const value of [-1, NaN, Infinity, -Infinity, undefined]) {
    assert.deepEqual(pageReady(ready, value as number, limits), badInput);
    for (const fact of ["navigationStartedAt", "lastNetworkActivityAt", "lastLayoutChangeAt"] as const) {
      assert.deepEqual(pageReady({ ...ready, [fact]: value } as PageReadyFacts, settleAt, limits), badInput, fact);
    }
    for (const limit of ["settleMs", "maxWaitMs"] as const) {
      assert.deepEqual(pageReady(ready, settleAt, { ...limits, [limit]: value } as PageReadyLimits), badInput, limit);
    }
  }
});

test("timestamps ahead of now hold with bad_input", () => {
  const badInput = { action: "hold", reason: "bad_input" };
  assert.deepEqual(pageReady(ready, ready.navigationStartedAt - 1, limits), badInput);
  assert.deepEqual(pageReady({ ...ready, lastNetworkActivityAt: settleAt + 1 }, settleAt, limits), badInput);
  assert.deepEqual(pageReady({ ...ready, lastLayoutChangeAt: settleAt + 1 }, settleAt, limits), badInput);
});

test("the default limits govern settling and the deadline", () => {
  const defaultSettleAt = ready.lastNetworkActivityAt + DEFAULT_SETTLE_MS;
  assert.equal(pageReady(ready, defaultSettleAt - 1).action, "wait");
  assert.equal(pageReady(ready, defaultSettleAt).action, "go");
  const defaultDeadline = ready.navigationStartedAt + DEFAULT_MAX_WAIT_MS;
  assert.deepEqual(pageReady({ ...ready, openRequests: 1 }, defaultDeadline), {
    action: "hold", reason: "page_never_settled",
  });
});

test("the same facts, time and limits always give the same result without changing the input", () => {
  const facts = Object.freeze({ ...ready, step: "fill" } as const);
  const fixedLimits = Object.freeze({ ...limits });
  const first = pageReady(facts, settleAt - 1, fixedLimits);
  assert.equal(first.action, "wait");
  assert.equal(pageReady(facts, settleAt, fixedLimits).action, "go");
  assert.deepEqual(pageReady(facts, settleAt - 1, fixedLimits), first);
});
