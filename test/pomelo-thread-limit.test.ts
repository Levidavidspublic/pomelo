import assert from "node:assert/strict";
import { test } from "node:test";
import { canOpenThread, THREAD_LIMITS, type ThreadLimitInput } from "../src/pomelo/thread-limit.js";

const mainAgentId = "main";
const parentThreadId = "parent-1";
const now = 1_000_000;
const input: ThreadLimitInput = { mainAgentId, callerId: mainAgentId, parentThreadId, now, threads: [] };
const recentThread = {
  openedBy: mainAgentId,
  openedByAgent: true,
  parentThreadId,
  openedAt: now - 1_000,
  isOpen: true,
};

function assertRefused(input: ThreadLimitInput, reason: RegExp): void {
  const decision = canOpenThread(input);
  assert.ok(decision.ok === false);
  assert.match(decision.reason, reason);
}

test("the first thread is allowed with frozen defaults", () => {
  assert.deepEqual(THREAD_LIMITS, { windowMs: 600_000, maxPerWindow: 5, maxOpenChildren: 20 });
  assert.equal(Object.isFrozen(THREAD_LIMITS), true);
  assert.deepEqual(canOpenThread(input), { ok: true });
});

test("the rate limit counts the caller's recent opens across parents, even if closed", () => {
  const threads = Array.from({ length: 5 }, (_, i) => ({
    ...recentThread,
    parentThreadId: "parent-2",
    openedAt: now - THREAD_LIMITS.windowMs + i,
    isOpen: false,
  }));

  assert.deepEqual(canOpenThread({ ...input, threads: threads.slice(1) }), { ok: true });
  assertRefused({ ...input, threads }, /opened too many threads recently/i);
  assert.deepEqual(canOpenThread({ ...input, threads, now: now + 1 }), { ok: true });
});

test("another agent's opens and future timestamps do not use the caller's recent quota", () => {
  const otherAgent = { ...recentThread, openedBy: "other-agent" };
  const future = { ...recentThread, openedAt: now + 1 };
  const threads = [...Array.from({ length: 5 }, () => ({ ...otherAgent })), future];

  assert.deepEqual(canOpenThread({ ...input, threads }), { ok: true });
});

test("the parent limit counts open agent children even after the rate window", () => {
  const threads = Array.from({ length: 20 }, () => ({
    ...recentThread,
    openedBy: "other-agent",
    openedAt: now - THREAD_LIMITS.windowMs - 1,
  }));

  assertRefused({ ...input, threads }, /too many open child threads/i);
  for (const excluded of [{ isOpen: false }, { parentThreadId: "parent-2" }, { parentThreadId: undefined }]) {
    assert.deepEqual(canOpenThread({
      ...input,
      threads: [...threads.slice(1), { ...threads[0], ...excluded }],
    }), { ok: true });
  }
});

test("human-opened threads count toward neither limit", () => {
  const threads = Array.from({ length: 20 }, () => ({ ...recentThread, openedByAgent: false }));
  assert.deepEqual(canOpenThread({ ...input, threads }), { ok: true });
});

test("a sub-agent is told to ask the main agent even with room for more threads", () => {
  assertRefused({ ...input, callerId: "research-lane" }, /ask the main agent/i);
});

test("positive custom limits apply", () => {
  const limits = { windowMs: 100, maxPerWindow: 1, maxOpenChildren: 1 };
  const closed = { ...recentThread, openedAt: now - 100, isOpen: false };

  assertRefused({
    ...input, limits, threads: [closed],
  }, /opened too many threads recently/i);
  assert.deepEqual(canOpenThread({ ...input, limits, threads: [closed], now: now + 1 }), { ok: true });
  assertRefused({ ...input, limits, threads: [recentThread] }, /too many open child threads/i);
});

test("a missing caller or non-finite time returns a reason", () => {
  const { callerId: _callerId, ...missingCaller } = input;
  assertRefused(missingCaller as ThreadLimitInput, /caller/i);
  assertRefused({ ...input, callerId: " " }, /caller/i);
  for (const time of [NaN, Infinity, -Infinity, "1000"]) {
    assertRefused({ ...input, now: time as number }, /finite/i);
    assertRefused({ ...input, threads: [{ ...recentThread, openedAt: time as number }] }, /finite/i);
  }
});

test("zero, negative and non-finite limits return a reason", () => {
  for (const value of [0, -1, NaN, Infinity]) {
    for (const key of Object.keys(THREAD_LIMITS)) {
      assertRefused({ ...input, limits: { ...THREAD_LIMITS, [key]: value } }, /limits/i);
    }
  }
});

test("refusal reasons leave out thread prompt text", () => {
  const prompt = "Compare two sample diagrams";
  const threads = Array.from({ length: 5 }, () => ({ ...recentThread, prompt }));
  const decision = canOpenThread({ ...input, threads });
  assert.ok(decision.ok === false);
  assert.ok(!decision.reason.includes(prompt));
});
