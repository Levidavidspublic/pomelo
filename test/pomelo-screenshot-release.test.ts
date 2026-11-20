import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MASK_AGE_MS,
  screenshotRelease,
  type MaskPass,
  type ShotFacts,
} from "../src/pomelo/browser/screenshot-release.js";

const shot: Readonly<ShotFacts> = Object.freeze({
  url: "https://example.test/form?view=first",
  navigationId: 7,
  scrollX: 0,
  scrollY: 40,
  viewportWidth: 1280,
  viewportHeight: 800,
  devicePixelRatio: 2,
  timestamp: 1000,
});
const pass: Readonly<MaskPass> = Object.freeze({
  ...shot,
  fieldsFound: 3,
  rectanglesApplied: 3,
  maskingEnabled: true,
});

test("releases a screenshot when all fields are covered and the page facts match", () => {
  assert.deepEqual(screenshotRelease(shot, pass), { release: true });
});

test("releases with masking off only when no fields need masking", () => {
  const disabled = { ...pass, maskingEnabled: false, rectanglesApplied: 0 };
  assert.deepEqual(screenshotRelease(shot, { ...disabled, fieldsFound: 0 }), { release: true });
  assert.deepEqual(screenshotRelease(shot, { ...disabled, fieldsFound: 1 }), {
    release: false, reason: "mask-off", retry: false,
  });
});

test("requires a mask pass", () => {
  for (const missing of [undefined, null]) {
    assert.deepEqual(screenshotRelease(shot, missing), {
      release: false, reason: "no-mask-pass", retry: true,
    });
  }
});

const changedFacts = [
  ["horizontal scroll", { scrollX: shot.scrollX + 1 }, "scrolled"],
  ["vertical scroll", { scrollY: shot.scrollY + 1 }, "scrolled"],
  ["viewport width", { viewportWidth: shot.viewportWidth - 1 }, "resized"],
  ["viewport height", { viewportHeight: shot.viewportHeight - 1 }, "resized"],
  ["device pixel ratio", { devicePixelRatio: 1.5 }, "resized"],
  ["navigation counter", { navigationId: shot.navigationId + 1 }, "page-changed"],
  ["origin", { url: "https://other.example.test/form?view=first" }, "page-changed"],
  ["path", { url: "https://example.test/other?view=first" }, "page-changed"],
  ["query", { url: "https://example.test/form?view=second" }, "page-changed"],
] as const;

for (const [name, change, reason] of changedFacts) {
  test(`requests another capture after a change in ${name}`, () => {
    assert.deepEqual(screenshotRelease({ ...shot, ...change }, pass), { release: false, reason, retry: true });
  });
}

test("rejects an address that cannot be parsed on either input", () => {
  const invalid = { url: "not an absolute address" };
  const refused = { release: false, reason: "page-changed", retry: true };
  assert.deepEqual(screenshotRelease({ ...shot, ...invalid }, pass), refused);
  assert.deepEqual(screenshotRelease(shot, { ...pass, ...invalid }), refused);
});

test("detects the addition of an explicit empty query", () => {
  const page = { ...shot, url: "https://example.test/form?" };
  const maskPass = { ...pass, url: "https://example.test/form" };
  assert.deepEqual(screenshotRelease(page, maskPass), { release: false, reason: "page-changed", retry: true });
});

test("allows a mask pass up to 500 ms old and refuses old or future passes", () => {
  assert.equal(MAX_MASK_AGE_MS, 500);
  const stale = { release: false, reason: "stale", retry: true };
  assert.deepEqual(screenshotRelease(shot, { ...pass, timestamp: 499 }), stale);
  assert.deepEqual(screenshotRelease(shot, { ...pass, timestamp: 500 }), { release: true });
  assert.deepEqual(screenshotRelease(shot, { ...pass, timestamp: 1001 }), stale);
});

test("holds a screenshot with fewer rectangles than fields", () => {
  assert.deepEqual(screenshotRelease(shot, { ...pass, rectanglesApplied: 2 }), {
    release: false, reason: "uncovered", retry: false,
  });
});

test("checks simultaneous faults in the required order", () => {
  const stale = { ...pass, timestamp: 0, rectanglesApplied: 2 };
  const scrolled = { ...stale, scrollY: 0 };
  const resized = { ...scrolled, viewportWidth: 1000 };
  const navigated = { ...resized, navigationId: 6 };
  const invalid = { ...navigated, scrollX: -1 };
  const disabled = { ...invalid, maskingEnabled: false };

  assert.deepEqual(screenshotRelease(shot, disabled), { release: false, reason: "mask-off", retry: false });
  assert.deepEqual(screenshotRelease(shot, invalid), { release: false, reason: "no-mask-pass", retry: true });
  assert.deepEqual(screenshotRelease(shot, navigated), { release: false, reason: "page-changed", retry: true });
  assert.deepEqual(screenshotRelease(shot, resized), { release: false, reason: "resized", retry: true });
  assert.deepEqual(screenshotRelease(shot, scrolled), { release: false, reason: "scrolled", retry: true });
  assert.deepEqual(screenshotRelease(shot, stale), { release: false, reason: "stale", retry: true });
});

test("refuses non-finite and negative numeric facts without throwing", () => {
  const absent = { release: false, reason: "no-mask-pass", retry: true };
  const pageNumbers = [
    "navigationId", "scrollX", "scrollY", "viewportWidth", "viewportHeight", "devicePixelRatio", "timestamp",
  ] as const;

  for (const value of [NaN, Infinity, -Infinity, -1]) {
    for (const key of pageNumbers) {
      assert.deepEqual(screenshotRelease({ ...shot, [key]: value }, pass), absent, `shot ${key}: ${value}`);
    }
    for (const key of [...pageNumbers, "fieldsFound", "rectanglesApplied"] as const) {
      assert.deepEqual(screenshotRelease(shot, { ...pass, [key]: value }), absent, `pass ${key}: ${value}`);
    }
  }
});

test("keeps a query canary out of every result and leaves the inputs intact", () => {
  const canary = "screenshot-query-canary-362";
  const page = Object.freeze({ ...shot, url: `https://example.test/form?view=${canary}` });
  const matching = Object.freeze({ ...pass, url: page.url });
  const pageBefore = { ...page };
  const passBefore = { ...matching };
  const passes = [
    matching,
    undefined,
    pass,
    { ...matching, maskingEnabled: false },
    { ...matching, scrollY: 0 },
    { ...matching, viewportHeight: 1 },
    { ...matching, timestamp: 0 },
    { ...matching, rectanglesApplied: 0 },
  ];
  for (const maskPass of passes) {
    assert.ok(!JSON.stringify(screenshotRelease(page, maskPass)).includes(canary));
  }
  assert.deepEqual(page, pageBefore);
  assert.deepEqual(matching, passBefore);
});
