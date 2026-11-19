import assert from "node:assert/strict";
import test from "node:test";
import { cloudReach } from "../src/pomelo/browser/cloud-reach.js";

const now = 1_000_000;
const windows = { now, staleAfterMs: 10_000, deadAfterMs: 30_000 };

test("a fresh good heartbeat is reachable even after a more recent failure", () => {
  const at = now - 1_000;
  const beats = [{ at: now - 20_000, ok: true }, { at, ok: true }, { at: now, ok: false }];
  assert.deepEqual(cloudReach({ ...windows, beats }), {
    state: "reachable",
    lastOkAt: at,
    heldReason: null,
    retryAfterMs: null,
  });
});

test("a good heartbeat is slow from the stale boundary to just before the dead boundary", () => {
  for (const age of [windows.staleAfterMs, windows.deadAfterMs - 1]) {
    const at = now - age;
    assert.deepEqual(cloudReach({ ...windows, beats: [{ at, ok: true }] }), {
      state: "slow",
      lastOkAt: at,
      heldReason: null,
      retryAfterMs: null,
    });
  }
});

test("a heartbeat at the dead boundary is unreachable and retains the last good time", () => {
  const at = now - windows.deadAfterMs;
  assert.deepEqual(cloudReach({ ...windows, beats: [{ at, ok: true }, { at: now, ok: false }] }), {
    state: "unreachable",
    lastOkAt: at,
    heldReason: "vps-unreachable",
    retryAfterMs: 5_000,
  });
});

test("an empty heartbeat history is unreachable with the initial retry delay", () => {
  assert.deepEqual(cloudReach({ ...windows, beats: [] }), {
    state: "unreachable",
    lastOkAt: null,
    heldReason: "vps-unreachable",
    retryAfterMs: 5_000,
  });
});

test("consecutive failures increase the retry delay up to one minute", () => {
  const failures = Array.from({ length: 4 }, (_, i) => ({ at: now - i * 1_000, ok: false }));
  for (const [index, delay] of [5_000, 15_000, 60_000, 60_000].entries()) {
    const beats = failures.slice(0, index + 1);
    assert.equal(cloudReach({ ...windows, beats }).retryAfterMs, delay);
  }
});

test("a good heartbeat resets the failure streak even after it passes the dead window", () => {
  const at = now - 40_000;
  const beats = [
    { at: at - 3_000, ok: false },
    { at: at - 2_000, ok: false },
    { at: at - 1_000, ok: false },
    { at, ok: true },
    { at: now - 1_000, ok: false },
    { at: now, ok: false },
  ];
  assert.equal(cloudReach({ ...windows, beats }).retryAfterMs, 15_000);
});

test("future and unreadable times are ignored for both freshness and retries", () => {
  const beats = [
    { at: now + 1, ok: true },
    { at: now + 2, ok: false },
    { at: "unreadable" as unknown as number, ok: true },
    { at: NaN, ok: true },
    { at: -Infinity, ok: false },
    { at: now, ok: false },
  ];
  assert.deepEqual(cloudReach({ ...windows, beats }), {
    state: "unreachable",
    lastOkAt: null,
    heldReason: "vps-unreachable",
    retryAfterMs: 5_000,
  });
});

test("unsorted heartbeats give the same result without changing the input order", () => {
  const good = { at: now - 40_000, ok: true };
  const earlierFailure = { at: good.at - 1_000, ok: false };
  const laterFailure = { at: now, ok: false };
  const beats = Object.freeze([laterFailure, earlierFailure, good]);
  const sorted = [earlierFailure, good, laterFailure];
  const result = cloudReach({ ...windows, beats });
  assert.deepEqual(result, cloudReach({ ...windows, beats: sorted }));
  assert.equal(result.retryAfterMs, 5_000);
});

test("a failure at the same time as a success does not increase the retry delay", () => {
  const at = now - 40_000;
  const beats = [{ at, ok: false }, { at, ok: true }, { at: now, ok: false }];
  assert.equal(cloudReach({ ...windows, beats }).retryAfterMs, 5_000);
  assert.equal(cloudReach({ ...windows, beats: beats.toReversed() }).retryAfterMs, 5_000);
});

test("the serialized result drops host, port, URL and error text from a heartbeat", () => {
  const host = "browser.example.invalid";
  const port = 42_198;
  const url = `ws://${host}:${port}/browser`;
  const error = "Fixture connection refused";
  const beats = [{ at: now, ok: false, host, port, url, error }];
  const json = JSON.stringify(cloudReach({ ...windows, beats }));

  for (const detail of [host, String(port), url, error]) {
    assert.equal(json.includes(detail), false);
  }
});
