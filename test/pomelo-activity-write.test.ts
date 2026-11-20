import assert from "node:assert/strict";
import test from "node:test";
import { decideActivityWrite } from "../src/pomelo/activity-write.js";

const lastWrittenAt = 10_000;

test("the first activity is written even if it is a streaming chunk", () => {
  const decision = decideActivityWrite({ lastWrittenAt: null, eventAt: 0, kind: "delta" });
  assert.equal(decision.action, "write");
  assert.match(decision.reason, /first activity/i);
});

for (const kind of ["message", "card", "approval", "subagent_result", "thread_opened", "job_held"]) {
  test(`${kind} is written even 10 ms after the last write`, () => {
    const decision = decideActivityWrite({ lastWrittenAt, eventAt: lastWrittenAt + 10, kind });
    assert.equal(decision.action, "write");
  });
}

for (const kind of ["delta", "tool_call", "unknown"]) {
  test(`${kind} waits until 2000 ms have elapsed`, () => {
    for (const elapsed of [500, 1999]) {
      const decision = decideActivityWrite({ lastWrittenAt, eventAt: lastWrittenAt + elapsed, kind });
      assert.equal(decision.action, "skip");
      assert.match(decision.reason, /minimum gap/i);
    }
    const decision = decideActivityWrite({ lastWrittenAt, eventAt: lastWrittenAt + 2000, kind });
    assert.equal(decision.action, "write");
  });
}

test("a custom minimum gap controls the write boundary", () => {
  const options = { minGapMs: 3000 };
  const input = { lastWrittenAt, eventAt: lastWrittenAt + 2000, kind: "delta" };
  assert.equal(decideActivityWrite(input, options).action, "skip");
  assert.equal(decideActivityWrite({ ...input, eventAt: lastWrittenAt + 3000 }, options).action, "write");
});

test("a zero minimum gap allows a newer event even after a write at time zero", () => {
  const input = { lastWrittenAt: 0, eventAt: 1, kind: "delta" };
  assert.equal(decideActivityWrite(input).action, "skip");
  assert.equal(decideActivityWrite(input, { minGapMs: 0 }).action, "write");
});

test("older and equal timestamps are skipped even for immediate events", () => {
  for (const eventAt of [lastWrittenAt - 1, lastWrittenAt]) {
    const decision = decideActivityWrite({ lastWrittenAt, eventAt, kind: "message" });
    assert.equal(decision.action, "skip");
    assert.match(decision.reason, /older than or equal/i);
  }
});

test("non-finite event times are skipped even for the first activity", () => {
  for (const eventAt of [NaN, Infinity, -Infinity]) {
    const decision = decideActivityWrite({ lastWrittenAt: null, eventAt, kind: "message" });
    assert.equal(decision.action, "skip");
    assert.match(decision.reason, /event time.*finite number/i);
  }
});

test("non-finite last written times are skipped", () => {
  for (const invalidTime of [NaN, Infinity, -Infinity]) {
    const decision = decideActivityWrite({ lastWrittenAt: invalidTime, eventAt: lastWrittenAt, kind: "message" });
    assert.equal(decision.action, "skip");
    assert.match(decision.reason, /last written time.*finite number/i);
  }
});

test("invalid minimum gaps fall back to 2000 ms", () => {
  const input = { lastWrittenAt, eventAt: lastWrittenAt + 500, kind: "delta" };
  for (const minGapMs of [-1, NaN, Infinity, -Infinity]) {
    assert.equal(decideActivityWrite(input, { minGapMs }).action, "skip");
    assert.equal(decideActivityWrite({ ...input, eventAt: lastWrittenAt + 2000 }, { minGapMs }).action, "write");
  }
});
