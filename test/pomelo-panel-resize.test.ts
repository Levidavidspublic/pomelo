import assert from "node:assert/strict";
import test from "node:test";
import { clampWidth, parseSavedWidth, resizeByDrag, resizeByKey, separatorProps } from "../src/client/pomelo/panel-resize.js";

const viewport = 1200;
const ltr = { viewport, dir: "ltr", shift: false } as const;
const rtl = { viewport, dir: "rtl", shift: false } as const;

test("clamps the panel width and leaves room for the chat", () => {
  assert.equal(clampWidth(200, viewport), 320);
  assert.equal(clampWidth(420, viewport), 420);
  assert.equal(clampWidth(800, viewport), 720);
  assert.equal(clampWidth(420, 1000), 420);
  assert.equal(clampWidth(800, 1000), 520);
});

test("keeps the minimum panel width when the viewport is too narrow", () => {
  assert.equal(clampWidth(200, 700), 320);
  assert.equal(clampWidth(600, 700), 320);
});

test("the arrow toward the chat grows the panel in each direction", () => {
  assert.equal(resizeByKey(420, "ArrowLeft", ltr), 436);
  assert.equal(resizeByKey(420, "ArrowRight", ltr), 404);
  assert.equal(resizeByKey(420, "ArrowRight", rtl), 436);
  assert.equal(resizeByKey(420, "ArrowLeft", rtl), 404);
});

test("Shift changes the arrow step to 64 pixels while respecting the limits", () => {
  const shiftLtr = { ...ltr, shift: true };
  const shiftRtl = { ...rtl, shift: true };
  assert.equal(resizeByKey(420, "ArrowLeft", shiftLtr), 484);
  assert.equal(resizeByKey(420, "ArrowLeft", shiftRtl), 356);
  assert.equal(resizeByKey(700, "ArrowLeft", shiftLtr), 720);
  assert.equal(resizeByKey(340, "ArrowLeft", shiftRtl), 320);
});

test("Home and End move to the width limits", () => {
  assert.equal(resizeByKey(420, "Home", ltr), 320);
  assert.equal(resizeByKey(420, "End", rtl), 720);
  assert.equal(resizeByKey(420, "End", { ...rtl, viewport: 700 }), 320);
});

test("unrelated keys pass through", () => {
  assert.equal(resizeByKey(420, "Tab", ltr), null);
  assert.equal(resizeByKey(420, "ArrowUp", rtl), null);
});

test("dragging toward the chat grows the panel and dragging away shrinks it", () => {
  assert.equal(resizeByDrag(420, -40, ltr), 460);
  assert.equal(resizeByDrag(420, 40, rtl), 460);
  assert.equal(resizeByDrag(420, 40, ltr), 380);
  assert.equal(resizeByDrag(420, -40, rtl), 380);
  assert.equal(resizeByDrag(420, -500, ltr), 720);
  assert.equal(resizeByDrag(420, -500, rtl), 320);
});

test("reads saved widths as whole pixels and rejects invalid values", () => {
  assert.equal(parseSavedWidth("420"), 420);
  assert.equal(parseSavedWidth("420.6"), 421);
  assert.equal(parseSavedWidth("1"), 1);
  for (const raw of ["", "abc", "-5", "0.9", "420px", "Infinity", null]) {
    assert.equal(parseSavedWidth(raw), null);
  }
});

test("the focusable vertical separator reports the width within its limits", () => {
  assert.deepEqual(separatorProps(900, viewport), {
    role: "separator",
    "aria-orientation": "vertical",
    "aria-valuemin": 320,
    "aria-valuemax": 720,
    "aria-valuenow": 720,
    tabIndex: 0,
  });
  assert.equal(separatorProps(420, viewport)["aria-valuenow"], 420);
  assert.equal(separatorProps(200, viewport)["aria-valuenow"], 320);
  assert.deepEqual(separatorProps(420, 700), {
    role: "separator",
    "aria-orientation": "vertical",
    "aria-valuemin": 320,
    "aria-valuemax": 320,
    "aria-valuenow": 320,
    tabIndex: 0,
  });
});
