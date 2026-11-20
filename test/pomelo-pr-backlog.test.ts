import assert from "node:assert/strict";
import test from "node:test";
import { prBacklog, type PrBacklogPr } from "../src/pomelo/pr-backlog.js";

const now = 60 * 60 * 1_000;

function ticketPrs(count: number, overrides: Partial<PrBacklogPr> = {}): PrBacklogPr[] {
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    ticketKey: `P0-${index + 1}`,
    phase: 0,
    openedAt: now - 1_000,
    checkState: "passed",
    waitingOnAmit: false,
    ...overrides,
  }));
}

test("an empty list gives go and the full capacity", () => {
  assert.deepEqual(prBacklog([], now), {
    verdict: "go",
    open: 0,
    waitingOnAmit: 0,
    byPhase: {},
    ignored: 0,
    mayStart: 30,
    reason: "0 open ticket PRs, below the soft limit of 20. Keep starting tickets.",
  });
});

test("the soft limit gives fewer with capacity up to the hard limit", () => {
  assert.equal(prBacklog(ticketPrs(19), now).verdict, "go");
  for (const count of [20, 29]) {
    const result = prBacklog(ticketPrs(count), now);
    assert.equal(result.verdict, "fewer");
    assert.equal(result.open, count);
    assert.equal(result.mayStart, 30 - count);
    assert.match(result.reason, /soft limit of 20/);
  }
});

test("at or above the hard limit, stop starting tickets", () => {
  for (const count of [30, 31]) {
    const result = prBacklog(ticketPrs(count), now);
    assert.equal(result.verdict, "stop");
    assert.equal(result.open, count);
    assert.equal(result.mayStart, 0);
    assert.match(result.reason, /hard limit of 30/);
  }
});

test("15 PRs waiting on Amit stop new starts before the soft limit", () => {
  const prs = ticketPrs(15, { waitingOnAmit: true, checkState: "running" });
  assert.equal(prBacklog(prs.slice(0, 14), now).verdict, "go");
  const result = prBacklog(prs, now);
  assert.equal(result.verdict, "stop");
  assert.equal(result.waitingOnAmit, 15);
  assert.equal(result.mayStart, 0);
  assert.match(result.reason, /15 .* waiting on Amit/);
});

test("callers can override the three limits", () => {
  const limits = { softLimit: 2, hardLimit: 4, waitingOnAmitLimit: 1 };
  const fewer = prBacklog(ticketPrs(2), now, limits);
  assert.equal(fewer.verdict, "fewer");
  assert.equal(fewer.mayStart, 2);
  assert.equal(prBacklog(ticketPrs(4), now, limits).verdict, "stop");
  assert.equal(prBacklog(ticketPrs(1, { waitingOnAmit: true }), now, limits).verdict, "stop");
  assert.equal(prBacklog(ticketPrs(2), now, { softLimit: 2 }).verdict, "fewer");
});

test("invalid limits fall back to defaults", () => {
  const prs = ticketPrs(20);
  const expected = prBacklog(prs, now);
  const waitingPrs = ticketPrs(15, { waitingOnAmit: true });
  const expectedWaiting = prBacklog(waitingPrs, now);
  for (const invalid of [0, -1, 1.5, NaN, Infinity]) {
    assert.deepEqual(prBacklog(prs, now, { softLimit: invalid, hardLimit: invalid }), expected);
    assert.deepEqual(prBacklog(waitingPrs, now, { waitingOnAmitLimit: invalid }), expectedWaiting);
  }
  assert.deepEqual(prBacklog(prs, now, { softLimit: 8, hardLimit: 4 }), expected);
});

test("non-ticket PRs are counted separately and do not affect either limit", () => {
  const prs = [
    ...ticketPrs(19),
    ...Array.from({ length: 15 }, (_, index) => ({ number: 20 + index, ticketKey: null, waitingOnAmit: true })),
    { number: 35 },
  ];
  const result = prBacklog(prs, now);
  assert.equal(result.verdict, "go");
  assert.equal(result.open, 19);
  assert.equal(result.waitingOnAmit, 0);
  assert.equal(result.ignored, 16);
});

test("missing or unreadable snapshots stop new starts with a plain reason", () => {
  const unreadable = [{ get number() { throw new Error("Unreadable PR"); } }];
  for (const prs of [undefined, null, {}, "unavailable", [null], [{}], unreadable, [{ number: 1, ticketKey: "P0-1" }]]) {
    const result = prBacklog(prs, now);
    assert.equal(result.verdict, "stop");
    assert.equal(result.mayStart, 0);
    assert.match(result.reason, /open PR list is missing or unreadable/);
  }
});

test("an unreadable current time stops new starts", () => {
  const result = prBacklog([], NaN);
  assert.equal(result.verdict, "stop");
  assert.equal(result.mayStart, 0);
  assert.match(result.reason, /current time is unreadable/);
});

test("phase counts add up to all open ticket PRs regardless of age or checks", () => {
  const prs = Object.freeze([
    ...ticketPrs(3),
    Object.freeze({ ...ticketPrs(1)[0], number: 4, ticketKey: "P2-1", phase: 2, checkState: "failed", openedAt: 0 }),
    Object.freeze({ ...ticketPrs(1)[0], number: 5, ticketKey: "G1-1", phase: "Gen 1", checkState: "running" }),
  ]);
  const result = prBacklog(prs, now);
  assert.deepEqual(result.byPhase, { 0: 3, 2: 1, "Gen 1": 1 });
  assert.equal(Object.values(result.byPhase).reduce((sum, count) => sum + count, 0), result.open);
  assert.deepEqual(prBacklog(prs, now + 24 * now), result);
});
