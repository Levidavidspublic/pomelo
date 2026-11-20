import assert from "node:assert/strict";
import { test } from "node:test";
import { applyViewAction, fitView, viewStyle, type ViewAction } from "../src/client/pomelo/diagram-view.js";

const frame = { width: 400, height: 300 };
const wide = { frame, diagram: { width: 800, height: 200 } };
const tall = { frame, diagram: { width: 200, height: 600 } };
const sameSize = { frame, diagram: { width: 400, height: 300 } };
const original = { scale: 1, x: 0, y: 0 };

test("fit centers wide and tall diagrams inside the frame", () => {
  assert.deepEqual(fitView(wide), { scale: 0.5, x: 0, y: 100 });
  assert.deepEqual(fitView(tall), { scale: 0.5, x: 150, y: 0 });
});

test("zoom buttons and keys step around the center of the frame", () => {
  const zoomed = { scale: 1.25, x: -50, y: -37.5 };
  assert.deepEqual(applyViewAction(original, { type: "zoom-in" }, sameSize), zoomed);
  assert.deepEqual(applyViewAction(original, { type: "key", key: "+" }, sameSize), zoomed);
  assert.deepEqual(applyViewAction(zoomed, { type: "zoom-out" }, sameSize), original);
  assert.deepEqual(applyViewAction(zoomed, { type: "key", key: "-" }, sameSize), original);
});

test("fit and zoom honor the default and custom scale limits", () => {
  const zoom = (factor: number): ViewAction => ({ type: "zoom-at", factor, x: 200, y: 150 });
  assert.equal(applyViewAction(original, zoom(100), sameSize).scale, 4);
  assert.equal(applyViewAction(original, zoom(0.01), sameSize).scale, 0.25);

  const limits = { minScale: 0.75, maxScale: 2 };
  assert.equal(applyViewAction(original, zoom(100), sameSize, limits).scale, 2);
  assert.equal(applyViewAction(original, zoom(0.01), sameSize, limits).scale, 0.75);
  assert.deepEqual(fitView(wide, limits), { scale: 0.75, x: -100, y: 75 });
});

test("point zoom holds a diagram point in place, including when scale hits a limit", () => {
  const before = { scale: 1, x: -30, y: 20 };
  const point = { x: 90, y: 80 };
  for (const factor of [0.5, 1.5, 5]) {
    const after = applyViewAction(before, { type: "zoom-at", factor, ...point }, sameSize);
    assert.equal(after.scale, Math.min(factor, 4));
    assert.equal((after.scale / before.scale) * (point.x - before.x) + after.x, point.x);
    assert.equal((after.scale / before.scale) * (point.y - before.y) + after.y, point.y);
  }
});

test("pointer pan is in frame pixels and keeps 24 pixels visible on both axes", () => {
  const before = { scale: 2, x: 0, y: 0 };
  assert.deepEqual(applyViewAction(before, { type: "pan", dx: 20, dy: -30 }, sameSize), {
    scale: 2, x: 20, y: -30,
  });
  assert.deepEqual(applyViewAction(before, { type: "pan", dx: -1e6, dy: 1e6 }, sameSize), {
    scale: 2, x: 24 - 800, y: 300 - 24,
  });
  assert.deepEqual(applyViewAction(before, { type: "pan", dx: 1e6, dy: -1e6 }, sameSize), {
    scale: 2, x: 400 - 24, y: 24 - 600,
  });
});

test("pan preserves the available overlap when the diagram or frame is small", () => {
  const geometry = { frame: { width: 10, height: 300 }, diagram: { width: 40, height: 12 } };
  assert.deepEqual(applyViewAction(original, { type: "pan", dx: -100, dy: 500 }, geometry), {
    scale: 1, x: -30, y: 288,
  });
});

test("arrows move the picture in physical directions in LTR and RTL, with a larger Shift step", () => {
  const moves = [
    { key: "ArrowLeft", x: -32, y: 0 },
    { key: "ArrowRight", x: 32, y: 0 },
    { key: "ArrowUp", x: 0, y: -32 },
    { key: "ArrowDown", x: 0, y: 32 },
  ];
  for (const direction of ["ltr", "rtl"]) {
    const geometry = { ...sameSize, direction };
    for (const { key, x, y } of moves) {
      assert.deepEqual(applyViewAction(original, { type: "key", key }, geometry), { scale: 1, x, y });
      assert.deepEqual(applyViewAction(original, { type: "key", key, shiftKey: true }, geometry), {
        scale: 1, x: x * 3, y: y * 3,
      });
    }
  }
  assert.deepEqual(applyViewAction(original, { type: "key", key: "Tab" }, sameSize), original);
});

test("reset action and the 0 key restore the centered fit", () => {
  const before = Object.freeze({ scale: 2, x: -30, y: 20 });
  assert.deepEqual(applyViewAction(before, { type: "reset" }, tall), fitView(tall));
  assert.deepEqual(applyViewAction(before, { type: "key", key: "0" }, tall), fitView(tall));
});

test("view style reports the CSS transform and zoom label, and respects reduced motion", () => {
  const view = { scale: 1.5, x: -30, y: 20 };
  const style = viewStyle(view);
  assert.equal(style.transform, "translate(-30px, 20px) scale(1.5)");
  assert.equal(style.transformOrigin, "0 0");
  assert.equal(style.label, "Zoom 150%");
  assert.match(style.transition, /^transform (12\d|1[3-7]\d|180)ms ease-out$/);
  assert.deepEqual(viewStyle(view, { reducedMotion: true }), { ...style, transition: "none" });
});

test("invalid numbers return fit and unusable geometry returns a neutral view", () => {
  const invalidViews = [{ scale: NaN, x: 0, y: 0 }, { scale: 0, x: 0, y: 0 }, { scale: 1, x: Infinity, y: 0 }];
  for (const view of invalidViews) {
    assert.deepEqual(applyViewAction(view, { type: "zoom-in" }, wide), fitView(wide));
    assert.deepEqual(viewStyle(view), viewStyle(original));
  }

  const invalidActions: ViewAction[] = [
    { type: "pan", dx: NaN, dy: 0 },
    { type: "zoom-at", x: NaN, y: 0, factor: 1.5 },
    { type: "zoom-at", x: 0, y: 0, factor: Infinity },
    { type: "zoom-at", x: 0, y: 0, factor: 0 },
  ];
  for (const action of invalidActions) {
    assert.deepEqual(applyViewAction(original, action, wide), fitView(wide));
  }
  assert.deepEqual(applyViewAction(original, { type: "zoom-in" }, wide, { maxScale: NaN }), fitView(wide));

  for (const geometry of [
    { ...wide, frame: { width: 0, height: 300 } },
    { ...wide, frame: { width: 400, height: NaN } },
    { ...wide, diagram: { width: 800, height: 0 } },
  ]) {
    assert.deepEqual(fitView(geometry), original);
    assert.deepEqual(applyViewAction(original, { type: "pan", dx: 100, dy: 100 }, geometry), original);
  }
});
