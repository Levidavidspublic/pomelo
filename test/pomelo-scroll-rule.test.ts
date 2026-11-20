import assert from "node:assert/strict";
import test from "node:test";
import { checkScroll, SCROLL_LIMITS } from "../src/pomelo/browser/scroll-rule.js";
import type { ScrollFacts, ScrollObservation } from "../src/pomelo/browser/scroll-rule.js";

const empty = Object.freeze({
  beforeHeight: 500,
  afterHeight: 500,
  beforeElementCount: 10,
  afterElementCount: 10,
});
const grewInHeight = Object.freeze({ ...empty, afterHeight: 600.5, afterElementCount: 9 });
const grewInCount = Object.freeze({ ...empty, afterHeight: 450, afterElementCount: 11 });

function facts(history: readonly ScrollObservation[] = [], scrollCount = history.length): ScrollFacts {
  return { scrollCount, history, takenOver: false };
}

test("the first scroll is allowed and the result has only the three public fields", () => {
  const result = checkScroll(facts());
  assert.deepEqual(Object.keys(result).sort(), ["reason", "scrollsLeft", "verdict"]);
  assert.equal(result.verdict, "scroll");
  assert.match(result.reason, /^Scroll\b/);
  assert.equal(result.scrollsLeft, SCROLL_LIMITS.maxPerPage);
});

test("either a taller page or more masked elements allows scrolling under the cap", () => {
  const history = Object.freeze([grewInHeight, grewInCount]);
  const input = Object.freeze(facts(history, SCROLL_LIMITS.maxPerPage - 1));
  const result = checkScroll(input);
  assert.equal(result.verdict, "scroll");
  assert.equal(result.scrollsLeft, 1);
});

test("the frozen cap stops scrolling and the reason gives the count", () => {
  assert.ok(Object.isFrozen(SCROLL_LIMITS));
  assert.equal(SCROLL_LIMITS.emptyInARow, 2);
  const count = SCROLL_LIMITS.maxPerPage;
  const result = checkScroll(facts([grewInHeight, grewInCount], count));
  assert.equal(result.verdict, "enough");
  assert.equal(result.scrollsLeft, 0);
  assert.match(result.reason, new RegExp(`^Enough.*\\b${count}\\b`));
  assert.match(result.reason, /without finding the end/);
});

test("two unchanged scrolls in a row bring nothing new", () => {
  const result = checkScroll(facts([grewInHeight, empty, empty]));
  assert.equal(result.verdict, "enough");
  assert.equal(result.scrollsLeft, 0);
  assert.match(result.reason, /^Enough.*nothing new/);
});

test("one empty scroll is allowed and growth resets the streak", () => {
  assert.equal(checkScroll(facts([empty])).verdict, "scroll");
  assert.equal(checkScroll(facts([empty, grewInHeight])).verdict, "scroll");
  assert.equal(checkScroll(facts([empty, grewInHeight, empty])).verdict, "scroll");
});

test("a shorter page or fewer elements without any growth counts as empty", () => {
  const shorter = { ...empty, afterHeight: 400 };
  const fewer = { ...empty, afterElementCount: 9 };
  const result = checkScroll(facts([shorter, fewer]));
  assert.equal(result.verdict, "enough");
  assert.match(result.reason, /nothing new/);
});

test("Amit taking over holds scrolling even when the page has reached the cap", () => {
  const input = facts([grewInHeight, grewInCount], SCROLL_LIMITS.maxPerPage);
  const result = checkScroll({ ...input, takenOver: true });
  assert.equal(result.verdict, "hold");
  assert.equal(result.scrollsLeft, 0);
  assert.match(result.reason, /^Hold.*Amit/);
});

test("invalid or missing scroll counts and missing takeover facts hold scrolling", () => {
  for (const scrollCount of [-1, NaN, undefined, 0.5, Infinity]) {
    const result = checkScroll({ ...facts(), scrollCount } as ScrollFacts);
    assert.equal(result.verdict, "hold");
    assert.equal(result.scrollsLeft, 0);
    assert.match(result.reason, /^Hold\b/);
  }
  const missingTakeover: Partial<ScrollFacts> = { scrollCount: 0, history: [] };
  assert.equal(checkScroll(missingTakeover as ScrollFacts).verdict, "hold");
});

test("the history must account for the latest scrolls and cannot exceed the total", () => {
  assert.equal(checkScroll(facts([empty], 0)).verdict, "hold");
  assert.equal(checkScroll(facts([empty], 2)).verdict, "hold");
  assert.equal(checkScroll({ scrollCount: 0, takenOver: false } as ScrollFacts).verdict, "hold");
  const sparse = new Array<ScrollObservation>(1);
  assert.equal(checkScroll(facts(sparse)).verdict, "hold");
});

test("invalid or missing measurements hold scrolling", () => {
  const invalid: Partial<ScrollObservation>[] = [
    { ...empty, beforeHeight: -1 },
    { ...empty, afterHeight: Infinity },
    { ...empty, beforeElementCount: 0.5 },
    { ...empty, afterElementCount: NaN },
    { ...empty, afterElementCount: undefined },
  ];
  for (const observation of invalid) {
    assert.equal(checkScroll(facts([observation as ScrollObservation])).verdict, "hold");
  }
});

test("a lower caller cap is honored and a higher one is clamped", () => {
  assert.equal(checkScroll(facts(), { maxPerPage: 1 }).scrollsLeft, 1);
  assert.equal(checkScroll(facts([grewInHeight]), { maxPerPage: 1 }).verdict, "enough");
  assert.equal(checkScroll(facts(), { maxPerPage: 0 }).verdict, "enough");

  const cap = SCROLL_LIMITS.maxPerPage;
  const options = { maxPerPage: cap + 1 };
  assert.equal(checkScroll(facts(), options).scrollsLeft, cap);
  assert.equal(checkScroll(facts([grewInHeight, grewInCount], cap), options).verdict, "enough");
});

test("an invalid caller cap holds scrolling", () => {
  for (const maxPerPage of [-1, NaN, 1.5, Infinity]) {
    const result = checkScroll(facts(), { maxPerPage });
    assert.equal(result.verdict, "hold");
    assert.equal(result.scrollsLeft, 0);
  }
});
