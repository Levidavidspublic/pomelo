import assert from "node:assert/strict";
import { test } from "node:test";
import {
  openViewer,
  viewerKey,
  viewerLabel,
  viewerReduce,
  type ViewerAction,
  type ViewerCard,
  type ViewerPicture,
  type ViewerState,
} from "../src/client/pomelo/image-viewer.js";

function picture(id: string, width = 800, height = 400): ViewerPicture {
  return { id, width, height, source: { mode: "show", src: `pictures/${id}.png`, alt: "Sample picture" } };
}

const viewport = { width: 400, height: 300 };
const card: ViewerCard = { ...picture("one"), viewport };

function opened(from = card): ViewerState {
  const result = openViewer(from);
  assert.ok(result.open);
  return result;
}

function update(state: ViewerState, action: ViewerAction): ViewerState {
  const result = viewerReduce(state, action);
  assert.ok("open" in result && result.open);
  return result;
}

test("opening fits the image in the window and keeps the opener card id", () => {
  const state = opened();
  assert.equal(state.fitScale, 0.5);
  assert.equal(state.zoom, 1);
  assert.equal(state.x, 0);
  assert.equal(state.y, 0);
  assert.equal(state.openerCardId, "one");
  assert.deepEqual(state.pictures[state.index], {
    id: "one", src: "pictures/one.png", alt: "Sample picture", width: 800, height: 400,
  });
  assert.equal(opened({ ...picture("small", 100, 75), viewport }).fitScale, 1);
});

test("zoom changes by 25 percentage points and stops at fit and 400%", () => {
  let state = opened();
  assert.equal(update(state, { type: "zoom-out" }).zoom, 1);
  for (let step = 1; step <= 14; step++) {
    state = update(state, { type: "zoom-in" });
    assert.equal(state.zoom, Math.min(1 + step * 0.25, 4));
  }
  for (let step = 1; step <= 14; step++) {
    state = update(state, { type: "zoom-out" });
    assert.equal(state.zoom, Math.max(4 - step * 0.25, 1));
  }
});

test("keyboard and pointer use the same commands", () => {
  const state = update(opened(), { type: "zoom-in" });
  const commands: [string, ViewerAction][] = [
    ["+", { type: "zoom-in" }],
    ["-", { type: "zoom-out" }],
    ["ArrowLeft", { type: "pan", dx: -32, dy: 0 }],
    ["ArrowRight", { type: "pan", dx: 32, dy: 0 }],
    ["ArrowUp", { type: "pan", dx: 0, dy: -32 }],
    ["ArrowDown", { type: "pan", dx: 0, dy: 32 }],
    ["0", { type: "reset" }],
    ["Escape", { type: "close" }],
  ];
  for (const [key, pointer] of commands) {
    const keyboard = viewerKey(key);
    assert.deepEqual(keyboard, pointer);
    assert.ok(keyboard);
    assert.deepEqual(viewerReduce(state, keyboard), viewerReduce(state, pointer));
  }
  assert.equal(viewerKey("Tab"), undefined);
});

test("panning keeps at least 24 pixels visible on each axis when space allows", () => {
  const fit = opened();
  assert.deepEqual(update(fit, { type: "pan", dx: 100, dy: -100 }), fit);

  const zoomed = update(fit, { type: "zoom-in" });
  const moved = update(zoomed, { type: "pan", dx: 30, dy: -40 });
  assert.deepEqual([moved.x, moved.y], [30, -40]);
  const far = update(moved, { type: "pan", dx: 1e6, dy: -1e6 });
  assert.deepEqual([far.x, far.y], [426, -251]);
  const opposite = update(far, { type: "pan", dx: -1e6, dy: 1e6 });
  assert.deepEqual([opposite.x, opposite.y], [-426, 251]);

  const small = opened({ ...picture("tiny", 1, 1), viewport: { width: 10, height: 1 } });
  const smallZoomed = update(small, { type: "zoom-in" });
  const smallMoved = update(smallZoomed, { type: "pan", dx: 100, dy: 100 });
  assert.deepEqual([smallMoved.x, smallMoved.y], [4.375, 0.125]);
});

test("zooming out clamps the current offset and fit clears it", () => {
  const fit = opened();
  const zoomed = update(update(fit, { type: "zoom-in" }), { type: "zoom-in" });
  const moved = update(zoomed, { type: "pan", dx: 1e6, dy: -1e6 });
  const smaller = update(moved, { type: "zoom-out" });
  assert.deepEqual([smaller.x, smaller.y], [426, -251]);
  assert.deepEqual(update(smaller, { type: "zoom-out" }), fit);
  assert.deepEqual(update(moved, { type: "reset" }), fit);
});

test("next and previous stay in reply order, stop at the ends, and refit each picture", () => {
  const second = picture("two", 300, 1200);
  const third = picture("three");
  const start = opened({ ...second, viewport, replyPictures: [card, second, third] });
  assert.equal(start.index, 1);

  const first = update(start, { type: "previous" });
  assert.equal(first.pictures[first.index]?.id, "one");
  assert.deepEqual(update(first, { type: "previous" }), first);

  const zoomed = update(first, { type: "zoom-in" });
  const moved = update(zoomed, { type: "pan", dx: 64, dy: 64 });
  assert.deepEqual(update(moved, { type: "next" }), start);
  assert.equal(start.fitScale, 0.25);

  const last = update(start, { type: "next" });
  assert.equal(last.pictures[last.index]?.id, "three");
  assert.deepEqual(update(last, { type: "next" }), last);
  assert.deepEqual(viewerReduce(last, { type: "close" }), { closed: true, focusCardId: "two" });
});

test("sources outside the viewer use the fallback and navigation skips them", () => {
  const link: ViewerPicture = {
    ...picture("link"),
    source: { mode: "link", href: "https://example.invalid/sample.png", alt: "Sample picture", reason: "remote" },
  };
  const refused: ViewerPicture = { ...picture("refused"), source: { mode: "refuse", reason: "Invalid image source" } };
  const last = picture("last");
  const replyPictures = [card, link, refused, last];
  const fallback = { open: false, showLink: true };
  assert.deepEqual(openViewer({ ...link, replyPictures }), fallback);
  assert.deepEqual(openViewer({ ...refused, replyPictures }), fallback);
  assert.deepEqual(openViewer({ ...link, replyPictures: [picture("link")] }), fallback);

  const state = opened({ ...card, replyPictures });
  assert.deepEqual(state.pictures.map(({ id }) => id), ["one", "last"]);
  const next = update(state, { type: "next" });
  assert.equal(next.pictures[next.index]?.id, "last");
  assert.deepEqual(update(next, { type: "previous" }), state);
});

test("missing and invalid dimensions yield finite state and keep the image centered", () => {
  const { id, source } = card;
  for (const from of [
    { ...card, width: 0 },
    { ...card, height: -1 },
    { id, source, viewport },
    { id, source },
    { ...card, viewport: { width: 0, height: 300 } },
    { ...card, viewport: { width: 400, height: -1 } },
    { ...card, viewport: { width: 400 } },
    { ...card, width: Infinity },
    { ...card, viewport: { width: NaN, height: 300 } },
  ]) {
    const fit = opened(from);
    assert.equal(fit.fitScale, 1);
    const zoomed = update(fit, { type: "zoom-in" });
    const moved = update(zoomed, { type: "pan", dx: 100, dy: -100 });
    assert.deepEqual([moved.zoom, moved.x, moved.y], [1.25, 0, 0]);
    assert.deepEqual(update(moved, { type: "reset" }), fit);
  }
  const zoomed = update(opened(), { type: "zoom-in" });
  assert.deepEqual(update(zoomed, { type: "pan", dx: NaN, dy: Infinity }), zoomed);
});

test("labels report position and zoom in plain words", () => {
  assert.equal(viewerLabel(opened()), "Picture, zoom 100%");
  const second = picture("two");
  let state = opened({ ...second, viewport, replyPictures: [card, second, picture("three")] });
  state = update(update(state, { type: "zoom-in" }), { type: "zoom-in" });
  assert.equal(viewerLabel(state), "Picture 2 of 3, zoom 150%");
  assert.equal(viewerLabel(openViewer({ ...card, source: { mode: "refuse", reason: "Invalid image source" } })), "Picture unavailable");
  assert.equal(viewerLabel(viewerReduce(state, { type: "close" })), "Picture viewer closed");
});

test("the reducer leaves its input intact", () => {
  const initial = opened({ ...card, replyPictures: [card, picture("two")] });
  const snapshot = structuredClone(initial);
  initial.pictures.forEach(Object.freeze);
  Object.freeze(initial.pictures);
  Object.freeze(initial.viewport);
  Object.freeze(initial);

  const zoomed = Object.freeze(update(initial, { type: "zoom-in" }));
  assert.notEqual(update(zoomed, { type: "pan", dx: 32, dy: 0 }).x, zoomed.x);
  assert.equal(update(zoomed, { type: "next" }).index, 1);
  assert.deepEqual(update(zoomed, { type: "reset" }), initial);
  assert.deepEqual(initial, snapshot);
});
