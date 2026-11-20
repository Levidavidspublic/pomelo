import assert from "node:assert/strict";
import test from "node:test";
import { checkRunLock, type RunLock } from "../src/pomelo/run-lock.js";

const now = 600_000;
const staleAfterMs = 30_000;
const opts = { owner: "worker-b", staleAfterMs };
const liveLock: RunLock = Object.freeze({
  runId: "run-a",
  startedAt: 1_000,
  lastHeartbeatAt: now - 5_000,
  owner: "worker-a",
});
const newLock: RunLock = {
  runId: "run-b",
  startedAt: now,
  lastHeartbeatAt: now,
  owner: "worker-b",
};

test("a missing run lock allows a start and supplies the lock to write", () => {
  for (const missing of [undefined, null]) {
    const result = checkRunLock(missing, "run-b", now, opts);
    assert.equal(result.verdict, "start");
    assert.match(result.reason, /no run lock/i);
    assert.equal(result.heldBy, undefined);
    assert.deepEqual(result.newLock, newLock);
  }
});

test("a fresh heartbeat keeps the other run's lock held", () => {
  const result = checkRunLock(liveLock, "run-b", now, opts);
  assert.equal(result.verdict, "wait");
  assert.equal(result.heldBy, "run-a");
  assert.equal(result.newLock, undefined);
});

test("a heartbeat at the stale limit still holds the lock", () => {
  const lock = { ...liveLock, lastHeartbeatAt: now - staleAfterMs };
  const result = checkRunLock(lock, "run-b", now, opts);
  assert.equal(result.verdict, "wait");
  assert.equal(result.heldBy, "run-a");
});

test("a heartbeat past the stale limit allows takeover and names the old run", () => {
  const lock = Object.freeze({ ...liveLock, lastHeartbeatAt: now - staleAfterMs - 1 });
  const result = checkRunLock(lock, "run-b", now, opts);
  assert.equal(result.verdict, "take-over");
  assert.equal(result.heldBy, "run-a");
  assert.match(result.reason, /stale/i);
  assert.deepEqual(result.newLock, newLock);
});

test("a heartbeat in the future keeps the other run's lock held", () => {
  const lock = { ...liveLock, lastHeartbeatAt: now + staleAfterMs };
  const result = checkRunLock(lock, "run-b", now, opts);
  assert.equal(result.verdict, "wait");
  assert.equal(result.heldBy, "run-a");
  assert.equal(result.newLock, undefined);
});

test("an unreadable run lock allows a start with a plain reason", () => {
  let getterCalls = 0;
  const revoked = Proxy.revocable(liveLock, {});
  revoked.revoke();
  const unreadableLocks = [
    "bad record",
    {},
    { ...liveLock, owner: undefined },
    { ...liveLock, runId: "" },
    { ...liveLock, runId: 123 },
    { ...liveLock, startedAt: "1000" },
    { ...liveLock, lastHeartbeatAt: NaN },
    { ...liveLock, lastHeartbeatAt: Infinity },
    {
      ...liveLock,
      get lastHeartbeatAt() {
        getterCalls++;
        return liveLock.lastHeartbeatAt;
      },
    },
    revoked.proxy,
  ];
  for (const lock of unreadableLocks) {
    const result = checkRunLock(lock, "run-b", now, opts);
    assert.equal(result.verdict, "start");
    assert.match(result.reason, /unreadable/i);
    assert.deepEqual(result.newLock, newLock);
  }
  assert.equal(getterCalls, 0);
});

test("the same run can refresh its lock and keeps its start time and owner", () => {
  const result = checkRunLock(liveLock, "run-a", now, opts);
  assert.equal(result.verdict, "start");
  assert.match(result.reason, /already holds/i);
  assert.deepEqual(result.newLock, { ...liveLock, lastHeartbeatAt: now });
  const earlierResult = checkRunLock(liveLock, "run-a", liveLock.lastHeartbeatAt - 1, opts);
  assert.equal(earlierResult.verdict, "start");
  assert.deepEqual(earlierResult.newLock, liveLock);
});

test("the stale limit is configurable and defaults to five minutes", () => {
  const defaultLimitMs = 5 * 60_000;
  const insideDefault = { ...liveLock, lastHeartbeatAt: now - defaultLimitMs };
  const pastDefault = { ...insideDefault, lastHeartbeatAt: now - defaultLimitMs - 1 };
  assert.equal(checkRunLock(insideDefault, "run-b", now, opts).verdict, "take-over");
  assert.equal(checkRunLock(insideDefault, "run-b", now).verdict, "wait");
  const result = checkRunLock(pastDefault, "run-b", now);
  assert.equal(result.verdict, "take-over");
  assert.deepEqual(result.newLock, { ...newLock, owner: "run-b" });

  for (const badLimit of [0, -1, NaN, Infinity]) {
    assert.equal(checkRunLock(insideDefault, "run-b", now, { staleAfterMs: badLimit }).verdict, "wait");
    assert.equal(checkRunLock(pastDefault, "run-b", now, { staleAfterMs: badLimit }).verdict, "take-over");
  }
});

test("a non-finite current time does not produce a lock to write", () => {
  for (const lock of [null, liveLock]) {
    const result = checkRunLock(lock, "run-b", Infinity, opts);
    assert.equal(result.verdict, "wait");
    assert.equal(result.newLock, undefined);
  }
});
