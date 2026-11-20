import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_LOOP_LIMITS, stepLoopCheck } from "../src/pomelo/browser/step-loop.js";
import { sweepForCanary } from "../src/pomelo/canary-sweep.js";

const click = { kind: "click", target: "button-1", pageUrl: "https://example.invalid/a", fingerprint: "a1" };
const pageA = { kind: "open", pageUrl: click.pageUrl, fingerprint: "a1" };
const pageB = { kind: "open", pageUrl: "https://example.invalid/b", fingerprint: "b1" };

function roundTrips(count: number) {
  return [pageA, ...Array.from({ length: count }, () => [pageB, pageA]).flat()];
}

test("an empty step list goes on", () => {
  const result = stepLoopCheck([]);
  assert.equal(result.verdict, "go");
  assert.equal(result.repeats, 0);
});

test("three clicks on different targets go on", () => {
  const steps = [click, { ...click, target: "button-2" }, { ...click, target: "button-3" }];
  assert.equal(stepLoopCheck(steps).verdict, "go");
});

test("the same click with an unchanged fingerprint warns at two and holds at three", () => {
  for (const [count, verdict] of [[2, "warn"], [3, "hold"], [4, "hold"]] as const) {
    const result = stepLoopCheck(Array.from({ length: count }, () => click));
    assert.equal(result.verdict, verdict);
    assert.equal(result.action, "click");
    assert.equal(result.repeats, count);
    assert.match(result.reason, /\bclick\b/);
    assert.match(result.reason, new RegExp(`\\b${count}\\b`));
    if (verdict === "hold") assert.match(result.reason, /\bAmit\b/);
  }
});

test("a changed fingerprint or action ends a click streak", () => {
  const changing = [click, { ...click, fingerprint: "a2" }, { ...click, fingerprint: "a3" }];
  assert.equal(stepLoopCheck(changing).verdict, "go");
  assert.equal(stepLoopCheck([click, click, click, { ...click, kind: "read" }]).verdict, "go");
});

test("scroll and wait steps leave the click count alone", () => {
  const scroll = { ...click, kind: "scroll" };
  const wait = { ...click, kind: "wait" };
  assert.equal(stepLoopCheck([scroll, wait, scroll]).verdict, "go");
  const steps = [click, scroll, click, wait];
  const warning = stepLoopCheck(steps);
  assert.equal(warning.verdict, "warn");
  assert.equal(warning.repeats, 2);
  const hold = stepLoopCheck([...steps, click]);
  assert.equal(hold.verdict, "hold");
  assert.equal(hold.repeats, 3);
});

test("page identity uses origin and path", () => {
  const queryChanges = [click, { ...click, pageUrl: `${click.pageUrl}?view=list` }, { ...click, pageUrl: `${click.pageUrl}#top` }];
  assert.equal(stepLoopCheck(queryChanges).verdict, "hold");
  for (const pageUrl of [pageB.pageUrl, "https://other.example.invalid/a"]) {
    assert.equal(stepLoopCheck([click, click, { ...click, pageUrl }]).verdict, "go");
  }
});

test("three round trips warn and four hold", () => {
  for (const [count, verdict] of [[3, "warn"], [4, "hold"]] as const) {
    const result = stepLoopCheck(roundTrips(count));
    assert.equal(result.verdict, verdict);
    assert.equal(result.action, "open");
    assert.equal(result.repeats, count);
    assert.match(result.reason, /round trips/);
    assert.match(result.reason, new RegExp(`\\b${count}\\b`));
  }
  const unfinished = stepLoopCheck([...roundTrips(3), pageB]);
  assert.equal(unfinished.verdict, "warn");
  assert.equal(unfinished.repeats, 3);
});

test("a step on the current page interrupts the round trips", () => {
  const steps = [...roundTrips(2), { ...pageA, kind: "read" }, ...roundTrips(2).slice(1)];
  assert.equal(stepLoopCheck(steps).verdict, "go");
  assert.equal(stepLoopCheck([...roundTrips(4), { ...pageA, kind: "read" }]).verdict, "go");
});

test("custom limits apply and invalid limits fall back to the frozen defaults", () => {
  assert.deepEqual(DEFAULT_LOOP_LIMITS, { maxSameStepRepeats: 3, maxRoundTrips: 4 });
  assert.ok(Object.isFrozen(DEFAULT_LOOP_LIMITS));
  assert.equal(stepLoopCheck([click, click, click], { maxSameStepRepeats: 4 }).verdict, "warn");
  assert.equal(stepLoopCheck([click, click], { maxSameStepRepeats: 2 }).verdict, "hold");
  assert.equal(stepLoopCheck(roundTrips(2), { maxRoundTrips: 2 }).verdict, "hold");
  for (const invalid of [1, -1, 2.5, NaN, Infinity]) {
    assert.equal(stepLoopCheck([click, click], { maxSameStepRepeats: invalid }).verdict, "warn");
    assert.equal(stepLoopCheck(roundTrips(3), { maxRoundTrips: invalid }).verdict, "warn");
  }
});

test("the canary sweep finds zero hits in warning and hold results", () => {
  const canary = "synthetic-loop-canary / +";
  const step = { ...click, kind: "type", target: canary, text: canary, value: canary, fingerprint: canary };
  const steps = [0, 1, 2].map((index) => ({ ...step, pageUrl: `${click.pageUrl}?q=${encodeURIComponent(canary)}&i=${index}` }));
  const warning = stepLoopCheck(steps.slice(0, 2));
  const hold = stepLoopCheck(steps);
  const unknownKind = stepLoopCheck(steps.map((entry) => ({ ...entry, kind: canary })));
  assert.equal(warning.verdict, "warn");
  assert.equal(hold.verdict, "hold");
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify([warning, hold, unknownKind]) }), []);
});
