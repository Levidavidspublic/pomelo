import assert from "node:assert/strict";
import test from "node:test";
import { workerSlot } from "../src/pomelo/worker-slots.js";

const snapshot = {
  workersRunning: 1,
  ticketsStarted: 3,
  maxWorkers: 2,
  maxTicketsPerRun: 4,
  mergePaused: false,
  uncappedPaidTools: 0,
  ticket: { needs_amit: false, state: "new" },
};

test("a new worker can start below both limits", () => {
  assert.deepEqual(workerSlot(snapshot), {
    verdict: "start", reason: "slot_available", mergePaused: false,
  });
});

test("at or above the worker limit, wait for a slot", () => {
  for (const workersRunning of [2, 3]) {
    assert.deepEqual(workerSlot({ ...snapshot, workersRunning }), {
      verdict: "wait", reason: "worker_limit", mergePaused: false,
    });
  }
});

test("at or above the per-run ticket limit, stop even if a worker slot is free", () => {
  for (const ticketsStarted of [4, 5]) {
    assert.deepEqual(workerSlot({ ...snapshot, ticketsStarted }), {
      verdict: "stop", reason: "ticket_limit", mergePaused: false,
    });
  }
});

test("when both limits are reached, the per-run ticket limit stops the run", () => {
  assert.deepEqual(workerSlot({ ...snapshot, workersRunning: 2, ticketsStarted: 4 }), {
    verdict: "stop", reason: "ticket_limit", mergePaused: false,
  });
});

test("an uncapped paid tool stops the run even with free slots", () => {
  assert.deepEqual(workerSlot({ ...snapshot, uncappedPaidTools: 1 }), {
    verdict: "stop", reason: "uncapped_paid_tools", mergePaused: false,
  });
});

test("a config-lane ticket waits for Amit", () => {
  assert.deepEqual(workerSlot({ ...snapshot, ticket: { needs_amit: true, state: "new" } }), {
    verdict: "wait", reason: "needs_amit", mergePaused: false,
  });
});

test("only tickets in the new state can start", () => {
  for (const state of ["running", "pr_open", "done", "stuck", "held", "open"]) {
    assert.deepEqual(workerSlot({ ...snapshot, ticket: { needs_amit: false, state } }), {
      verdict: "wait", reason: "ticket_not_new", mergePaused: false,
    }, state);
  }
});

test("the merge pause is reported on start, wait, and stop", () => {
  const paused = { ...snapshot, mergePaused: true };
  assert.deepEqual(workerSlot(paused), {
    verdict: "start", reason: "slot_available", mergePaused: true,
  });
  assert.deepEqual(workerSlot({ ...paused, workersRunning: 2 }), {
    verdict: "wait", reason: "worker_limit", mergePaused: true,
  });
  assert.deepEqual(workerSlot({ ...paused, uncappedPaidTools: 1 }), {
    verdict: "stop", reason: "uncapped_paid_tools", mergePaused: true,
  });
});

test("either limit must be a positive whole number", () => {
  for (const field of ["maxWorkers", "maxTicketsPerRun"] as const) {
    for (const value of [0, -1, 1.5, NaN, Infinity, undefined]) {
      assert.deepEqual(workerSlot({ ...snapshot, [field]: value }), {
        verdict: "stop", reason: "bad_limit", mergePaused: false,
      }, `${field} = ${value}`);
    }
  }
});

test("each count must be a nonnegative whole number", () => {
  for (const field of ["workersRunning", "ticketsStarted", "uncappedPaidTools"] as const) {
    for (const value of [-1, 0.5, NaN, Infinity]) {
      assert.deepEqual(workerSlot({ ...snapshot, [field]: value }), {
        verdict: "stop", reason: "bad_count", mergePaused: false,
      }, `${field} = ${value}`);
    }
  }
});
