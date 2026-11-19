import assert from "node:assert/strict";
import test from "node:test";
import { contrast, TAG_PALETTE, tagColour } from "../src/client/pomelo/tag-colour.js";

test("valid stored hex colours are preserved and lower-cased", () => {
  assert.equal(tagColour("design", "#1a2b3c").bg, "#1a2b3c");
  assert.equal(tagColour("design", "#A1B2C3").bg, "#a1b2c3");
});

test("invalid stored colours fall back to the slug's palette colour", () => {
  const fallback = tagColour("design");
  assert.ok(TAG_PALETTE.includes(fallback.bg));
  for (const colour of [
    "red",
    "#fff",
    "#12345678",
    "rgb(0,0,0)",
    "url(javascript:1)",
    "var(--colour)",
    "#12345g",
    "#123456;background:url(x)",
    " #123456",
    "#123456 ",
    "#123456\n",
    null,
    ["#123456"],
  ]) {
    assert.deepEqual(tagColour("design", colour), fallback, JSON.stringify(colour));
  }
});

test("fallback colours are stable by slug and handle an empty slug", () => {
  const first = tagColour("alpha");
  const second = tagColour("beta");
  assert.ok(TAG_PALETTE.includes(first.bg));
  assert.ok(TAG_PALETTE.includes(second.bg));
  assert.notEqual(first.bg, second.bg);
  assert.deepEqual(tagColour("alpha"), first);
  assert.deepEqual(tagColour("beta"), second);
  assert.ok(TAG_PALETTE.includes(tagColour("").bg));
});

test("contrast gives the WCAG ratios for black, white and mid grey", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert.ok(Math.abs(contrast("#ffffff", "#777777") - 4.478) < 0.001);
});

test("all eight palette colours and stored backgrounds get the higher-contrast foreground", () => {
  assert.equal(TAG_PALETTE.length, 8);
  assert.equal(new Set(TAG_PALETTE).size, 8);
  for (const bg of [...TAG_PALETTE, "#000000", "#ffffff", "#777777"]) {
    assert.match(bg, /^#[0-9a-f]{6}$/);
    const colours = tagColour("design", bg);
    const whiteContrast = contrast(bg, "#ffffff");
    const blackContrast = contrast(bg, "#000000");

    assert.equal(colours.bg, bg);
    assert.equal(colours.fg, whiteContrast > blackContrast ? "#ffffff" : "#000000", bg);
    assert.ok(contrast(bg, colours.fg) >= 4.5, bg);
  }
});
