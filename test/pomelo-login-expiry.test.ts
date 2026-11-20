import assert from "node:assert/strict";
import test from "node:test";
import { checkLoginExpiry } from "../src/pomelo/browser/login-expiry.js";

const dayMs = 86_400_000;
const nowMs = 1_800_000_000_000;

test("uses the latest dated expiry even when earlier cookies have expired", () => {
  const expiries = Object.freeze([nowMs - dayMs, nowMs + 10 * dayMs, nowMs + dayMs, 0]);
  const { rows } = checkLoginExpiry([{ site: "example.test", expiries }], nowMs);

  assert.deepEqual(rows, [{ site: "example.test", state: "ok", daysLeft: 10 }]);
});

test("warns up to and including three days before expiry", () => {
  const { rows } = checkLoginExpiry([
    { site: "today.test", expiries: [nowMs + dayMs / 2] },
    { site: "boundary.test", expiries: [nowMs + 3 * dayMs] },
    { site: "later.test", expiries: [nowMs + 3.5 * dayMs] },
  ], nowMs);

  assert.deepEqual(rows, [
    { site: "today.test", state: "soon", daysLeft: 0.5 },
    { site: "boundary.test", state: "soon", daysLeft: 3 },
    { site: "later.test", state: "ok", daysLeft: 3.5 },
  ]);
});

test("marks sign-ins expired at or before the supplied time", () => {
  const { rows } = checkLoginExpiry([
    { site: "past.test", expiries: [0, nowMs - dayMs] },
    { site: "now.test", expiries: [nowMs] },
  ], nowMs);

  assert.deepEqual(rows, [
    { site: "past.test", state: "expired", daysLeft: 0 },
    { site: "now.test", state: "expired", daysLeft: 0 },
  ]);
});

test("distinguishes session cookies from an empty list", () => {
  const { rows } = checkLoginExpiry([
    { site: "session.test", expiries: [0, 0] },
    { site: "missing-time.test", expiries: [undefined] },
    { site: "empty.test", expiries: [] },
  ], nowMs);

  assert.deepEqual(rows, [
    { site: "session.test", state: "session-only", daysLeft: null },
    { site: "missing-time.test", state: "session-only", daysLeft: null },
    { site: "empty.test", state: "unknown", daysLeft: null },
  ]);
});

test("lists only soon and expired sites in name order and summarizes the count", () => {
  const { needsImport, summary } = checkLoginExpiry([
    { site: "z.test", expiries: [nowMs + dayMs] },
    { site: "ok.test", expiries: [nowMs + 10 * dayMs] },
    { site: "a.test", expiries: [nowMs - dayMs] },
    { site: "session.test", expiries: [0] },
    { site: "unknown.test", expiries: [] },
  ], nowMs);

  assert.deepEqual(needsImport, ["a.test", "z.test"]);
  assert.equal(summary, "2 sign-ins need a new import");
  assert.equal(checkLoginExpiry([], nowMs).summary, "0 sign-ins need a new import");
});

test("honours a custom warning window in days", () => {
  const sites = [{ site: "example.test", expiries: [nowMs + 4 * dayMs] }];
  const result = checkLoginExpiry(sites, nowMs, { soonDays: 4 });

  assert.equal(checkLoginExpiry(sites, nowMs).rows[0].state, "ok");
  assert.deepEqual(result.rows, [{ site: "example.test", state: "soon", daysLeft: 4 }]);
  assert.deepEqual(result.needsImport, ["example.test"]);
  assert.equal(result.summary, "1 sign-in needs a new import");
});

test("omits an extra value field from the entire result", () => {
  const input = { site: "example.test", expiries: [nowMs + dayMs], value: "CANARY-7f3a" };
  const result = checkLoginExpiry([input], nowMs);

  assert.equal(JSON.stringify(result).includes(input.value), false);
  assert.deepEqual(result.rows, [{ site: "example.test", state: "soon", daysLeft: 1 }]);
});
