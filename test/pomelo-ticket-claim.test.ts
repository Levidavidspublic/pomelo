import assert from "node:assert/strict";
import test from "node:test";
import { claimDecision } from "../src/pomelo/ticket-claim.js";
import type { TicketClaimInput } from "../src/pomelo/ticket-claim.js";

const now = 1_000_000;
const staleAfterMs = 30_000;
const input: TicketClaimInput = {
  ticketKey: "501",
  ticketState: "open",
  workerId: "worker-a",
  claims: [],
  now,
  staleAfterMs,
};
const otherClaim = { ticketKey: input.ticketKey, workerId: "worker-b", heartbeatAt: now - 1_000 };
const staleClaim = { ...otherClaim, heartbeatAt: now - staleAfterMs - 1 };

test("a ticket without a claim can be taken", () => {
  assert.deepEqual(claimDecision(input), { action: "take" });
  const unrelated = { ...otherClaim, ticketKey: "502" };
  assert.deepEqual(claimDecision({ ...input, claims: [unrelated, unrelated] }), { action: "take" });
});

test("a worker keeps its own live claim", () => {
  const ownClaim = { ...otherClaim, workerId: input.workerId };
  assert.deepEqual(claimDecision({ ...input, claims: [ownClaim] }), { action: "keep" });
});

test("another worker's live claim names the holder and its cutoff", () => {
  assert.deepEqual(claimDecision({ ...input, claims: [otherClaim] }), {
    action: "wait", holderId: "worker-b", liveThrough: otherClaim.heartbeatAt + staleAfterMs,
  });
});

test("an older claim can be taken and identifies the previous holder", () => {
  for (const holderId of [otherClaim.workerId, input.workerId]) {
    const claim = { ...staleClaim, workerId: holderId };
    assert.deepEqual(claimDecision({ ...input, claims: [claim] }), { action: "take", stale: true, holderId });
  }
});

test("a claim exactly at the cutoff is still live", () => {
  const claim = { ...otherClaim, heartbeatAt: now - staleAfterMs };
  assert.deepEqual(claimDecision({ ...input, claims: [claim] }), {
    action: "wait", holderId: "worker-b", liveThrough: now,
  });
});

test("done, stuck, and held tickets refuse a worker even if the claim is stale", () => {
  for (const [ticketState, reason] of [
    ["done", "The ticket is already done."],
    ["stuck", "The ticket is stuck."],
    ["held", "The ticket is held for Amit."],
  ]) {
    assert.deepEqual(claimDecision({ ...input, ticketState, claims: [staleClaim] }), { action: "refuse", reason });
  }
});

test("empty or blank ticket keys and worker IDs are refused", () => {
  for (const blank of ["", " \t"]) {
    assert.deepEqual(claimDecision({ ...input, ticketKey: blank }), {
      action: "refuse", reason: "The ticket key is empty.",
    });
    assert.deepEqual(claimDecision({ ...input, workerId: blank }), {
      action: "refuse", reason: "The worker ID is empty.",
    });
  }
});

test("a heartbeat from a clock ahead of ours is live", () => {
  const claim = { ...otherClaim, heartbeatAt: now + 2 * staleAfterMs };
  assert.deepEqual(claimDecision({ ...input, claims: [claim] }), {
    action: "wait", holderId: "worker-b", liveThrough: claim.heartbeatAt + staleAfterMs,
  });
});

test("duplicate claims name both holders even if one has gone stale", () => {
  const ownClaim = { ...otherClaim, workerId: input.workerId };
  assert.deepEqual(claimDecision({ ...input, claims: [ownClaim, staleClaim] }), {
    action: "refuse", reason: "The ticket has multiple claims from worker-a, worker-b.",
  });
});

test("a claim with unusable timing data cannot be taken", () => {
  for (const timing of [{ now: Infinity }, { staleAfterMs: -1 }, { staleAfterMs: NaN }]) {
    assert.equal(claimDecision({ ...input, ...timing, claims: [staleClaim] }).action, "refuse");
  }
  const claim = { ...otherClaim, heartbeatAt: -Infinity };
  assert.equal(claimDecision({ ...input, claims: [claim] }).action, "refuse");
});
