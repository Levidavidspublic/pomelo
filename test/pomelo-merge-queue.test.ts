import assert from "node:assert/strict";
import { test } from "node:test";
import { pickNextMerge, type MergeQueuePr } from "../src/pomelo/merge-queue.js";

const readyPr: MergeQueuePr = {
  ticketNumber: 2,
  base: "main",
  ready: true,
  fresh: true,
  held: false,
};

test("an empty queue has nothing to merge", () => {
  assert.deepEqual(pickNextMerge([], "main"), {
    mergeNow: null,
    updateFirst: [],
    waiting: [],
    reason: "There is nothing to merge.",
  });
});

test("a ready PR tested against the current base may merge", () => {
  const result = pickNextMerge([readyPr], "main");
  assert.deepEqual(result.mergeNow, { ticketNumber: 2, reason: "Ticket #2 may merge now." });
  assert.deepEqual(result.updateFirst, []);
  assert.deepEqual(result.waiting, []);
});

test("only the lowest ready ticket may merge and the next ticket must rerun after the base advances", () => {
  const nextPr = { ...readyPr, ticketNumber: 10 };
  const first = pickNextMerge([nextPr, readyPr], "main");
  assert.equal(first.mergeNow?.ticketNumber, 2);
  assert.deepEqual(first.updateFirst, []);
  assert.deepEqual(first.waiting, [{
    ticketNumber: 10,
    reason: "Ticket #10 must wait for ticket #2 to merge, then update and rerun checks.",
  }]);

  const afterMerge = pickNextMerge([{ ...nextPr, fresh: false }], "main");
  assert.equal(afterMerge.mergeNow, null);
  assert.deepEqual(afterMerge.updateFirst.map((decision) => decision.ticketNumber), [10]);
  assert.equal(pickNextMerge([nextPr], "main").mergeNow?.ticketNumber, 10);
});

test("a stale ticket must update first and does not block a fresh ready ticket", () => {
  const stalePr = { ...readyPr, ticketNumber: 1, fresh: false };
  const result = pickNextMerge([readyPr, stalePr], "main");
  assert.equal(result.mergeNow?.ticketNumber, 2);
  assert.deepEqual(result.updateFirst, [{
    ticketNumber: 1,
    reason: "Ticket #1 must update to the current base and rerun checks.",
  }]);
  assert.deepEqual(result.waiting, []);
});

test("held, draft, failing and wrong-base PRs wait with their own reasons", () => {
  const result = pickNextMerge([
    { ...readyPr, ticketNumber: 1, held: true, fresh: false },
    { ...readyPr, ticketNumber: 2, draft: true },
    { ...readyPr, ticketNumber: 3, ready: false },
    { ...readyPr, ticketNumber: 4, base: "release" },
  ], "main");

  assert.equal(result.mergeNow, null);
  assert.deepEqual(result.updateFirst, []);
  assert.deepEqual(result.waiting, [
    { ticketNumber: 1, reason: "Ticket #1 is on hold." },
    { ticketNumber: 2, reason: "Ticket #2 is a draft." },
    { ticketNumber: 3, reason: "Ticket #3 has not passed its readiness checks." },
    { ticketNumber: 4, reason: "Ticket #4 targets a different base branch." },
  ]);
  assert.equal(pickNextMerge([{ ...readyPr, base: "release" }], "release").mergeNow?.ticketNumber, 2);
});

test("the queue gives the same answer for repeated and reordered fixtures", () => {
  const prs = Object.freeze([
    Object.freeze({ ...readyPr, ticketNumber: 10 }),
    Object.freeze({ ...readyPr, ticketNumber: 8, fresh: false }),
    Object.freeze({ ...readyPr, ticketNumber: 3, held: true }),
    Object.freeze(readyPr),
    Object.freeze({ ...readyPr, ticketNumber: 1, fresh: false }),
  ]);

  const result = pickNextMerge(prs, "main");
  assert.deepEqual(pickNextMerge(prs, "main"), result);
  assert.deepEqual(pickNextMerge([...prs].reverse(), "main"), result);
});
