import assert from "node:assert/strict";
import test from "node:test";
import { ticketMoves } from "../src/pomelo/attempts.js";

test("tickets are ready, retryable, or stuck according to their failed attempts", () => {
  assert.deepEqual(ticketMoves([
    { number: 1, failedAttempts: 0, state: "open", when: [] },
    { number: 2, failedAttempts: 1, state: "open", when: [] },
    { number: 3, failedAttempts: 2, state: "open", when: [] },
    { number: 4, failedAttempts: 3, state: "open", when: [] },
    { number: 5, failedAttempts: 4, state: "open", when: [] },
  ]), [
    { number: 1, move: "ready" },
    { number: 2, move: "retry" },
    { number: 3, move: "retry" },
    { number: 4, move: "stuck" },
    { number: 5, move: "stuck" },
  ]);
});

test("a custom attempt limit changes when a ticket becomes stuck", () => {
  assert.deepEqual(ticketMoves([
    { number: 1, failedAttempts: 2, state: "open", when: [] },
    { number: 2, failedAttempts: 3, state: "open", when: [] },
    { number: 3, failedAttempts: 4, state: "open", when: [] },
  ], 4), [
    { number: 1, move: "retry" },
    { number: 2, move: "retry" },
    { number: 3, move: "stuck" },
  ]);
});

test("a waiting ticket lists its stuck, unfinished, and missing dependencies", () => {
  assert.deepEqual(ticketMoves([
    { number: 4, failedAttempts: 1, state: "open", when: [2, 3, 1, 99] },
    { number: 1, failedAttempts: 0, state: "open", when: [] },
    { number: 2, failedAttempts: 3, state: "open", when: [] },
    { number: 3, failedAttempts: 0, state: "done", when: [] },
  ]), [
    { number: 4, move: "waiting", waitingOn: [2, 1, 99] },
    { number: 1, move: "ready" },
    { number: 2, move: "stuck" },
    { number: 3, move: "done" },
  ]);
});

test("the ticket two steps from a stuck ticket waits on its direct dependency", () => {
  assert.deepEqual(ticketMoves([
    { number: 3, failedAttempts: 0, state: "open", when: [2] },
    { number: 2, failedAttempts: 0, state: "open", when: [1] },
    { number: 1, failedAttempts: 3, state: "open", when: [] },
  ]), [
    { number: 3, move: "waiting", waitingOn: [2] },
    { number: 2, move: "waiting", waitingOn: [1] },
    { number: 1, move: "stuck" },
  ]);
});

test("a done ticket stays done and releases its dependants", () => {
  assert.deepEqual(ticketMoves([
    { number: 1, failedAttempts: 3, state: "done", when: [99] },
    { number: 2, failedAttempts: 0, state: "open", when: [1] },
  ]), [
    { number: 1, move: "done" },
    { number: 2, move: "ready" },
  ]);
});

test("an exhausted ticket stays stuck while a dependency is unfinished", () => {
  assert.deepEqual(ticketMoves([
    { number: 1, failedAttempts: 3, state: "open", when: [2] },
    { number: 2, failedAttempts: 0, state: "open", when: [] },
  ]), [
    { number: 1, move: "stuck" },
    { number: 2, move: "ready" },
  ]);
});

test("both tickets in a dependency cycle wait", () => {
  assert.deepEqual(ticketMoves([
    { number: 1, failedAttempts: 0, state: "open", when: [2] },
    { number: 2, failedAttempts: 0, state: "open", when: [1] },
  ]), [
    { number: 1, move: "waiting", waitingOn: [2] },
    { number: 2, move: "waiting", waitingOn: [1] },
  ]);
});

test("each call returns a new frozen list and leaves the input untouched", () => {
  const when = Object.freeze([99]);
  const tickets = Object.freeze([
    Object.freeze({ number: 1, failedAttempts: 0, state: "open", when }),
  ]);
  const moves = ticketMoves(tickets);

  assert.ok(Object.isFrozen(moves));
  assert.notEqual(moves, ticketMoves(tickets));
  assert.notEqual(moves, tickets);
  const [result] = moves;
  assert.equal(result?.move, "waiting");
  assert.deepEqual(result.waitingOn, when);
  assert.notEqual(result.waitingOn, when);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.waitingOn));
});
