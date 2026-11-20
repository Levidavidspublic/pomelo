import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FILL_ATTEMPT_LIMITS,
  fillAttemptRule,
  type FillAttempt,
  type FillAttemptRequest,
} from "../src/pomelo/broker/fill-attempts.js";

const now = 1_000_000;
const request: FillAttemptRequest = Object.freeze({
  origin: "https://example.test",
  refId: "ref-1",
  jobId: "job-1",
});
const canary = "pomelo-invented-canary";

function attempt(outcome: FillAttempt["outcome"], age: number, overrides: Partial<FillAttemptRequest> = {}): FillAttempt {
  return Object.freeze({ ...request, ...overrides, outcome, at: now - age });
}

test("the first fill and a fill after one failed login are allowed", () => {
  assert.equal(fillAttemptRule([], request, now).decision, "allow");
  assert.equal(fillAttemptRule([attempt("login-failed", 1_000)], request, now).decision, "allow");
});

test("two recent failed logins hold for Amit, even if the fill would also be a repeat", () => {
  const history = [
    attempt("login-failed", 10_000, { jobId: "job-2" }),
    attempt("filled", 2_000),
    attempt("login-failed", 1_000),
  ];
  const result = fillAttemptRule(history, request, now);
  assert.equal(result.decision, "hold");
  assert.match(result.reason, /Amit/);
  assert.match(result.reason, /failed/i);
  assert.equal(result.waitMs, undefined);
});

test("failures older than fifteen minutes do not count", () => {
  const fifteenMinutes = 15 * 60 * 1_000;
  const recent = attempt("login-failed", 1_000);
  assert.equal(fillAttemptRule([attempt("login-failed", fifteenMinutes), recent], request, now).decision, "hold");
  assert.equal(fillAttemptRule([attempt("login-failed", fifteenMinutes + 1), recent], request, now).decision, "allow");
});

test("a successful login resets the count in timestamp order", () => {
  const history = Object.freeze([
    attempt("login-ok", 2_000, { jobId: "job-2" }),
    attempt("login-failed", 1_000),
    attempt("login-failed", 5_000),
    attempt("login-failed", 6_000),
  ]);
  assert.equal(fillAttemptRule(history, request, now).decision, "allow");
  assert.equal(fillAttemptRule([...history, attempt("login-failed", 500)], request, now).decision, "hold");
});

test("different origins and references have separate failure counts and resets", () => {
  const elsewhere = { origin: "https://other.example.test" };
  const otherAccount = { refId: "ref-2" };
  const recent = attempt("login-failed", 2_000);
  assert.equal(fillAttemptRule([
    recent, attempt("login-failed", 3_000, elsewhere), attempt("login-failed", 4_000, otherAccount),
  ], request, now).decision, "allow");
  assert.equal(fillAttemptRule([
    recent, attempt("login-failed", 3_000),
    attempt("login-ok", 1_000, elsewhere), attempt("login-ok", 1_000, otherAccount),
  ], request, now).decision, "hold");
});

test("the origin host is case insensitive and a different port is a separate origin", () => {
  const upper = { origin: "https://EXAMPLE.TEST" };
  const history = [attempt("login-failed", 2_000, upper), attempt("login-failed", 1_000)];
  assert.equal(fillAttemptRule(history, { ...request, ...upper }, now).decision, "hold");
  assert.equal(fillAttemptRule(history, { ...request, origin: "https://example.test:8443" }, now).decision, "allow");
});

test("a repeat fill in the same job waits five seconds from the latest fill", () => {
  const history = [attempt("filled", 2_000), attempt("filled", 4_000)];
  const result = fillAttemptRule(history, request, now);
  assert.equal(result.decision, "refuse");
  assert.match(result.reason, /already filled/i);
  assert.equal(result.waitMs, 3_000);
  assert.equal(fillAttemptRule(history, request, now + 2_999).waitMs, 1);
  assert.equal(fillAttemptRule(history, request, now + 3_000).decision, "allow");
});

test("fills for a different job, origin, or reference leave this fill free to proceed", () => {
  const history = [
    attempt("filled", 1_000, { jobId: "job-2" }),
    attempt("filled", 1_000, { origin: "https://other.example.test" }),
    attempt("filled", 1_000, { refId: "ref-2" }),
  ];
  assert.equal(fillAttemptRule(history, request, now).decision, "allow");
});

test("custom limits override the defaults", () => {
  assert.deepEqual(DEFAULT_FILL_ATTEMPT_LIMITS, { maxFailures: 2, failureWindowMs: 900_000, repeatWindowMs: 5_000 });
  const limits = { maxFailures: 1, failureWindowMs: 2_000, repeatWindowMs: 10_000 };
  assert.equal(fillAttemptRule([attempt("login-failed", 1_900)], request, now, limits).decision, "hold");
  assert.equal(fillAttemptRule([attempt("login-failed", 2_001)], request, now, limits).decision, "allow");
  assert.equal(fillAttemptRule([attempt("filled", 6_000)], request, now, limits).waitMs, 4_000);
  assert.equal(fillAttemptRule([attempt("login-failed", 1_000)], request, now, { maxFailures: 1 }).decision, "hold");
});

test("unknown fields cause a refusal and their contents stay out of the result", () => {
  const filled = attempt("filled", 1_000);
  for (const result of [
    fillAttemptRule([{ ...filled, value: canary }], request, now),
    fillAttemptRule([], { ...request, password: canary }, now),
    fillAttemptRule([], request, now, { stray: canary }),
  ]) {
    assert.equal(result.decision, "refuse");
    assert.equal(result.waitMs, undefined);
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
});

test("bad origins, missing identifiers and non-array history cause a refusal", () => {
  for (const origin of ["not an origin", "https://example.test/path", "https://user:invented@example.test", "null"]) {
    assert.equal(fillAttemptRule([], { ...request, origin }, now).decision, "refuse");
    assert.equal(fillAttemptRule([attempt("filled", 1_000, { origin })], request, now).decision, "refuse");
  }
  const { origin, jobId } = request;
  assert.equal(fillAttemptRule([], { origin, jobId }, now).decision, "refuse");
  assert.equal(fillAttemptRule([], { ...request, refId: " " }, now).decision, "refuse");
  assert.equal(fillAttemptRule({}, request, now).decision, "refuse");
  assert.equal(fillAttemptRule([, attempt("filled", 1_000)], request, now).decision, "refuse");
});

test("secret paths cannot stand in for identifiers", () => {
  const syntheticPath = "op://" + canary;
  assert.equal(fillAttemptRule([], { ...request, refId: syntheticPath }, now).decision, "refuse");
  const result = fillAttemptRule([attempt("filled", 1_000, { jobId: syntheticPath })], request, now);
  assert.equal(result.decision, "refuse");
  assert.equal(JSON.stringify(result).includes(canary), false);
});

test("an invalid clock, timestamp, outcome, or limit causes a refusal", () => {
  assert.equal(fillAttemptRule([], request, NaN).decision, "refuse");
  assert.equal(fillAttemptRule([attempt("login-failed", -1)], request, now).decision, "refuse");
  assert.equal(fillAttemptRule([{ ...attempt("filled", 0), outcome: "unknown" }], request, now).decision, "refuse");
  for (const limits of [null, { maxFailures: 1.5 }, { failureWindowMs: 0 }, { repeatWindowMs: Infinity }]) {
    assert.equal(fillAttemptRule([], request, now, limits).decision, "refuse");
  }
});

test("malformed records are refused without reading their accessors or echoing errors", () => {
  let getterCalled = false;
  const row = {
    ...attempt("filled", 0),
    get at() {
      getterCalled = true;
      return now;
    },
  };
  assert.equal(fillAttemptRule([row], request, now).decision, "refuse");
  assert.equal(getterCalled, false);

  const broken = new Proxy({}, { ownKeys() { throw new Error(canary); } });
  const result = fillAttemptRule([], broken, now);
  assert.equal(result.decision, "refuse");
  assert.equal(JSON.stringify(result).includes(canary), false);
});
