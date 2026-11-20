import assert from "node:assert/strict";
import test from "node:test";
import { paceDecision } from "../src/pomelo/browser/pace-rule.js";
import type { PaceHistoryEntry, PaceInput, PaceLimits } from "../src/pomelo/browser/pace-rule.js";

const host = "shop.example.test";
const now = 1_800_000_000_000;
const limits: PaceLimits = {
  minGapMs: 1_000,
  maxLoadsPerMinute: 3,
  maxRetryAfterMs: 60_000,
  baseBackoffMs: 2_000,
  maxBackoffMs: 3_000,
  holdAfter: 3,
};

const load = (age: number, details: Partial<PaceHistoryEntry> = {}): PaceHistoryEntry => ({
  host, action: "open", at: now - age, ...details,
});

function decide(history: readonly PaceHistoryEntry[] = [], input: Partial<PaceInput> = {}) {
  return paceDecision({ host, action: "open", now, history, limits, ...input });
}

test("the first load may go, and a second load waits for the remaining gap", () => {
  assert.deepEqual(decide(), { verdict: "go", host });
  assert.deepEqual(decide([load(400)], { action: "click" }), { verdict: "wait", host, waitMs: 600 });
  assert.deepEqual(decide([load(1_000)]), { verdict: "go", host });
});

test("reads and screenshots are free even during a hold, and do not count as loads", () => {
  const throttled = [load(8_000, { status: 429 }), load(4_000, { status: 503 }), load(0, { status: 429 })];
  for (const action of ["read", "screenshot"] as const) {
    assert.deepEqual(decide(throttled, { action }), { verdict: "go", host });
  }
  assert.deepEqual(decide([load(0, { action: "read" }), load(0, { action: "screenshot" })]), { verdict: "go", host });
});

test("the minute cap waits until enough loads leave the rolling window", () => {
  const history = Object.freeze([load(30_000), load(58_000), load(5_000, { action: "back" })]);
  assert.deepEqual(decide(history), { verdict: "wait", host, waitMs: 2_000 });
  assert.deepEqual(decide(history, { now: now + 2_000 }), { verdict: "go", host });
  assert.deepEqual(decide([...history, load(500)]), { verdict: "wait", host, waitMs: 30_000 });
});

test("loads and throttled responses on other exact hosts do not count", () => {
  const history = [
    load(200, { host: "example.test", status: 429 }),
    load(100, { host: "sub.shop.example.test", status: 503 }),
    load(0, { host: "other.example.test", status: 429 }),
  ];
  assert.deepEqual(decide(history), { verdict: "go", host });
});

test("a 429 honors a sane Retry-After in seconds from the response time", () => {
  const history = [load(0, { status: 429, retryAfterSec: 30 })];
  assert.deepEqual(decide(history), { verdict: "wait", host, waitMs: 30_000 });
  assert.deepEqual(decide(history, { now: now + 12_000 }), { verdict: "wait", host, waitMs: 18_000 });
  assert.deepEqual(decide(history, { now: now + 30_000 }), { verdict: "go", host });
});

test("a missing, negative, nonnumeric, or excessive Retry-After uses the back-off", () => {
  for (const retryAfterSec of [undefined, -1, NaN, Infinity, 61]) {
    assert.deepEqual(decide([load(0, { status: 429, retryAfterSec })]), { verdict: "wait", host, waitMs: 2_000 });
  }
});

test("back-off grows over consecutive 429 and 503 responses and stops at its cap", () => {
  const input = { limits: { ...limits, maxLoadsPerMinute: 4, maxBackoffMs: 6_000, holdAfter: 4 } };
  const first = load(12_000, { status: 429 });
  const second = load(6_000, { status: 503 });
  const third = load(0, { status: 429 });
  assert.deepEqual(decide([third], input), { verdict: "wait", host, waitMs: 2_000 });
  assert.deepEqual(decide([third, first], input), { verdict: "wait", host, waitMs: 4_000 });
  assert.deepEqual(decide([third, first, second], input), { verdict: "wait", host, waitMs: 6_000 });
});

test("the third consecutive throttled response holds the job for Amit", () => {
  const history = [load(8_000, { status: 429 }), load(4_000, { status: 503 }), load(0, { status: 429 })];
  assert.deepEqual(decide(history, { now: now + 120_000 }), {
    verdict: "hold", host, reason: "The site returned repeated 429 or 503 responses. Amit needs to review the job.",
  });
});

test("only a normal response on the same host resets the consecutive count", () => {
  const earlier = [load(85_000, { status: 429 }), load(70_000, { status: 503 })];
  const latest = load(0, { status: 429 });
  const wait = decide([...earlier, load(2_000, { status: 200 }), latest]);
  assert.deepEqual(wait, { verdict: "wait", host, waitMs: 2_000 });
  assert.equal(decide([...earlier, load(2_000, { action: "click" }), latest]).verdict, "hold");
  assert.equal(decide([...earlier, load(2_000, { host: "other.example.test", status: 200 }), latest]).verdict, "hold");
});

test("when several pace rules apply, the job waits for the longest one", () => {
  const history = [load(50_000), load(4_000), load(0, { status: 503, retryAfterSec: 3 })];
  assert.deepEqual(decide(history), { verdict: "wait", host, waitMs: 10_000 });
  assert.deepEqual(decide([load(0, { status: 429, retryAfterSec: 0 })]), { verdict: "wait", host, waitMs: 1_000 });
});

test("the result contains only the hostname from a supplied URL", () => {
  const address = "https://SHOP.example.test:8443/orders?token=fixture#details";
  assert.deepEqual(decide([load(400, { host: address })], { host: address }), { verdict: "wait", host, waitMs: 600 });
  assert.deepEqual(decide([load(400)], { host: address }), { verdict: "wait", host, waitMs: 600 });
});
