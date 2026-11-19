import assert from "node:assert/strict";
import test from "node:test";
import { ticketOrder } from "../src/pomelo/ticket-order.js";

test("an open ticket with no dependencies can start", () => {
  assert.deepEqual(ticketOrder([{ number: 1, state: "open", when: [] }], 1), {
    start: [1],
    waiting: [],
    loops: [],
    unknown: [],
  });
});

test("a ticket waits for its dependency to be done even when both could fit in the same batch", () => {
  const dependent = { number: 2, state: "open", when: [1] };
  const dependency = { number: 1, state: "open", when: [] };

  assert.deepEqual(ticketOrder([dependent, dependency], 2), {
    start: [1],
    waiting: [{ number: 2, waitingOn: [1] }],
    loops: [],
    unknown: [],
  });
  assert.deepEqual(ticketOrder([dependent, { ...dependency, state: "done" }], 2), {
    start: [2],
    waiting: [],
    loops: [],
    unknown: [],
  });
});

test("free slots cap the start list in ascending ticket order", () => {
  const tickets = [10, 3, 2].map((number) => ({ number, state: "open", when: [] }));

  assert.deepEqual(ticketOrder(tickets, 2), {
    start: [2, 3],
    waiting: [],
    loops: [],
    unknown: [],
  });
  assert.deepEqual(ticketOrder(tickets, 0).start, []);
});

test("held, needs_amit, stuck, running, and done tickets never start", () => {
  const tickets = ["held", "needs_amit", "stuck", "running", "done", "open"]
    .map((state, index) => ({ number: index + 1, state, when: [] }));

  assert.deepEqual(ticketOrder(tickets, 6).start, [6]);
});

test("a ticket lists its direct unfinished dependencies including a stuck ticket", () => {
  const result = ticketOrder([
    { number: 4, state: "open", when: [2, 3, 1] },
    { number: 1, state: "running", when: [] },
    { number: 2, state: "stuck", when: [] },
    { number: 3, state: "done", when: [] },
  ], 1);

  assert.deepEqual(result.start, []);
  assert.deepEqual(result.waiting, [{ number: 4, waitingOn: [2, 1] }]);
});

test("two- and three-ticket loops are named in dependency order", () => {
  const result = ticketOrder([
    { number: 5, state: "open", when: [4] },
    { number: 2, state: "open", when: [1] },
    { number: 3, state: "open", when: [5] },
    { number: 1, state: "open", when: [2] },
    { number: 4, state: "open", when: [3] },
  ], 5);

  assert.deepEqual(result.start, []);
  assert.deepEqual(result.waiting, [
    { number: 1, waitingOn: [2] },
    { number: 2, waitingOn: [1] },
    { number: 3, waitingOn: [5] },
    { number: 4, waitingOn: [3] },
    { number: 5, waitingOn: [4] },
  ]);
  assert.deepEqual(result.loops, [[1, 2, 1], [3, 5, 4, 3]]);
});

test("overlapping loops and self-dependencies are each named once", () => {
  const result = ticketOrder([
    { number: 1, state: "open", when: [2, 3, 3] },
    { number: 2, state: "open", when: [3] },
    { number: 3, state: "open", when: [1] },
    { number: 4, state: "held", when: [4] },
  ], 0);

  assert.deepEqual(result.loops, [[1, 2, 3, 1], [1, 3, 1], [4, 4]]);
});

test("unknown dependencies are reported with the ticket that references them", () => {
  const result = ticketOrder([
    { number: 1, state: "open", when: [99] },
    { number: 2, state: "done", when: [99] },
    { number: 3, state: "open", when: [2] },
  ], 3);

  assert.deepEqual(result, {
    start: [3],
    waiting: [{ number: 1, waitingOn: [99] }],
    loops: [],
    unknown: [{ number: 1, dependency: 99 }, { number: 2, dependency: 99 }],
  });
});

test("the input array, tickets, and when lists are left untouched", () => {
  const tickets = Object.freeze([
    Object.freeze({ number: 2, state: "open", when: Object.freeze([1, 99]) }),
    Object.freeze({ number: 1, state: "open", when: Object.freeze([]) }),
  ]);

  const result = ticketOrder(tickets, 1);

  assert.deepEqual(result.waiting, [{ number: 2, waitingOn: [1, 99] }]);
  assert.notEqual(result.waiting[0]?.waitingOn, tickets[0].when);
  assert.deepEqual(tickets, [
    { number: 2, state: "open", when: [1, 99] },
    { number: 1, state: "open", when: [] },
  ]);
});
