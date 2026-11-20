import assert from "node:assert/strict";
import test from "node:test";
import { checkApiQuota } from "../src/pomelo/api-quota.js";

const nowMs = 1_700_000_000_250;
const plenty = `{"resources":{
  "core":{"limit":5000,"remaining":4000,"reset":1700000060},
  "graphql":{"limit":5000,"remaining":5000,"reset":1700000300}
}}`;
const lowCore = `{"resources":{
  "core":{"limit":5000,"remaining":999,"reset":1700000060},
  "graphql":{"limit":1000,"remaining":200,"reset":1700000300}
}}`;
const lowGraphql = `{"resources":{
  "core":{"limit":5000,"remaining":999,"reset":1700000060},
  "graphql":{"limit":5000,"remaining":49,"reset":1700000300}
}}`;

test("plenty of calls lets the kitchen go and reports the lowest remaining count", () => {
  const result = checkApiQuota(plenty, nowMs);
  assert.equal(result.verdict, "go");
  assert.equal(result.waitMs, 0);
  assert.deepEqual(result.lowest, { name: "core", remaining: 4000, limit: 5000 });
  assert.ok(result.reason);
});

test("any active block under 20% slows the kitchen down", () => {
  const result = checkApiQuota(lowCore, nowMs);
  assert.equal(result.verdict, "slow");
  assert.equal(result.waitMs, 0);
  assert.match(result.reason, /core/);
});

test("GraphQL under 50 takes priority over a slow core and waits until the GraphQL reset", () => {
  const result = checkApiQuota(lowGraphql, nowMs);
  assert.equal(result.verdict, "wait");
  assert.equal(result.waitMs, 299_750);
  assert.deepEqual(result.lowest, { name: "graphql", remaining: 49, limit: 5000 });
  assert.match(result.reason, /graphql/i);
});

test("the thresholds are strict at 50 calls and at 20%", () => {
  const exactlyAtThresholds = `{"resources":{
    "core":{"limit":250,"remaining":50,"reset":1700000060},
    "graphql":{"limit":5000,"remaining":1000,"reset":1700000300}
  }}`;
  assert.equal(checkApiQuota(exactlyAtThresholds, nowMs).verdict, "go");
});

test("a reset in the past or at the supplied time clears that block's restriction", () => {
  assert.equal(checkApiQuota(lowGraphql, 1_700_000_060_000).verdict, "wait");
  const result = checkApiQuota(lowGraphql, 1_700_000_300_000);
  assert.equal(result.verdict, "go");
  assert.equal(result.waitMs, 0);
  assert.equal(checkApiQuota(lowGraphql, 1_700_000_300_001).verdict, "go");
});

test("when both active blocks are below 50, the wait covers both resets up to one hour", () => {
  const bothLow = `{"resources":{
    "core":{"limit":5000,"remaining":5,"reset":1700000060},
    "graphql":{"limit":5000,"remaining":49,"reset":1700007200}
  }}`;
  const result = checkApiQuota(bothLow, nowMs);
  assert.equal(result.verdict, "wait");
  assert.equal(result.waitMs, 3_600_000);
  assert.deepEqual(result.lowest, { name: "core", remaining: 5, limit: 5000 });
  assert.match(result.reason, /graphql/i);
});

test("bad JSON, missing blocks and invalid numbers are unreadable", () => {
  const invalidResponses = [
    "{",
    "null",
    "{}",
    '{"resources":{"core":{"limit":5000,"remaining":0,"reset":1700000060}}}',
    plenty.replace('"remaining":4000', '"remaining":"4000"'),
    plenty.replace('"limit":5000', '"limit":null'),
    plenty.replace('"reset":1700000060', '"reset":1e400'),
  ];
  for (const response of invalidResponses) {
    const result = checkApiQuota(response, nowMs);
    assert.equal(result.verdict, "unreadable", response);
    assert.equal(result.waitMs, 0);
    assert.equal(result.lowest, null);
    assert.ok(result.reason);
  }
});

test("callers can override either quota threshold independently", () => {
  assert.equal(checkApiQuota(lowGraphql, nowMs, { waitBelow: 49 }).verdict, "slow");
  assert.equal(checkApiQuota(lowCore, nowMs, { slowBelowRatio: 0.1 }).verdict, "go");
});
