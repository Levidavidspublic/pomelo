import assert from "node:assert/strict";
import test from "node:test";
import {
  checkTheme,
  contrastRatio,
  GLASS_BLUR_PX,
  luminance,
  over,
  parseHex,
  POMELO_TOKENS,
} from "../src/client/pomelo/theme-tokens.js";

test("Pomelo themes: parse short and full hex colours and reject other input", () => {
  assert.deepEqual(parseHex("#a3F"), { r: 170, g: 51, b: 255 });
  assert.deepEqual(parseHex("#A3a9B3"), { r: 163, g: 169, b: 179 });
  assert.equal(parseHex("#1234"), null);
  assert.equal(parseHex("#12345678"), null);
  assert.equal(parseHex("#GGG"), null);
  assert.equal(parseHex("ABC"), null);
  assert.equal(parseHex("#ABC\n"), null);
  assert.equal(parseHex(null), null);
});

test("Pomelo themes: glass composites to opaque RGB without rounding channels", () => {
  const backdrop = { r: 14, g: 15, b: 17 };
  const glass = { r: 28, g: 31, b: 36 };
  assert.deepEqual(over({ ...glass, a: 0 }, backdrop), backdrop);
  assert.deepEqual(over({ ...glass, a: 1 }, backdrop), glass);
  assert.deepEqual(over({ ...glass, a: 0.5 }, backdrop), { r: 21, g: 23, b: 26.5 });
});

test("Pomelo themes: WCAG contrast is 21 for black and white and 1 for white on white", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  assert.equal(contrastRatio(black, white).toFixed(2), "21.00");
  assert.equal(contrastRatio(white, black).toFixed(2), "21.00");
  assert.equal(contrastRatio(white, white).toFixed(2), "1.00");

  const nearBlack = { r: 10.2, g: 10.2, b: 10.2 };
  assert.ok(Math.abs(luminance(nearBlack) - 0.04 / 12.92) < 1e-10);
  assert.equal(luminance({ r: 255, g: 0, b: 0 }), 0.2126);
});

test("Pomelo themes: both starting palettes pass the 4.5:1 text contrast check", () => {
  assert.deepEqual(checkTheme(POMELO_TOKENS.dark), []);
  assert.deepEqual(checkTheme(POMELO_TOKENS.light), []);
});

test("Pomelo themes: report every background where dark secondary text fails", () => {
  const theme = { ...POMELO_TOKENS.dark, textSecondary: "#555C66" };
  const failures = checkTheme(theme).map(({ text, on, ratio }) => ({ text, on, ratio: ratio.toFixed(2) }));
  assert.deepEqual(failures, [
    { text: "textSecondary", on: "canvas", ratio: "2.84" },
    { text: "textSecondary", on: "surface", ratio: "2.63" },
    { text: "textSecondary", on: "glass-over-canvas", ratio: "2.61" },
    { text: "textSecondary", on: "glass-over-surface", ratio: "2.52" },
  ]);
});

test("Pomelo themes: evaluate each glass backdrop at the requested minimum", () => {
  const failures = checkTheme(POMELO_TOKENS.dark, 6.7);
  assert.equal(failures.length, 1);
  const [failure] = failures;
  assert.equal(failure.text, "accent");
  assert.equal(failure.on, "glass-over-surface");
  assert.equal(failure.ratio.toFixed(2), "6.61");
  assert.deepEqual(checkTheme(POMELO_TOKENS.dark, failure.ratio), []);
});

test("Pomelo themes: the palettes and their glass colours are frozen", () => {
  assert.equal(GLASS_BLUR_PX, 20);
  assert.ok(Object.isFrozen(POMELO_TOKENS));
  assert.ok(Object.isFrozen(POMELO_TOKENS.dark));
  assert.ok(Object.isFrozen(POMELO_TOKENS.light));
  assert.ok(Object.isFrozen(POMELO_TOKENS.dark.glass));
  assert.ok(Object.isFrozen(POMELO_TOKENS.light.glass));
  assert.equal(Reflect.set(POMELO_TOKENS.dark, "text", "#555C66"), false);
  assert.equal(Reflect.set(POMELO_TOKENS.dark.glass, "a", 1), false);
});
