import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_IMAGE_MAX_HEIGHT,
  DEFAULT_IMAGE_ASPECT_RATIO,
  MAX_IMAGE_ALT_LENGTH,
  MAX_IMAGE_ASPECT_RATIO,
  MIN_IMAGE_ASPECT_RATIO,
  imageFrame,
} from "../src/client/pomelo/image-frame.js";

test("reserves a 16:9 chat box while loading", () => {
  const frame = imageFrame({ width: 1600, height: 900 }, "loading", "chat");
  assert.equal(frame.state, "loading");
  assert.deepEqual(frame.box, { aspectRatio: 16 / 9, maxHeight: CHAT_IMAGE_MAX_HEIGHT });
});

test("uses the default ratio when either dimension is missing or invalid", () => {
  for (const dimension of [undefined, 0, -1, NaN, Infinity, "900"]) {
    assert.equal(imageFrame({ width: dimension, height: 900 }, "loading", "chat").box.aspectRatio, DEFAULT_IMAGE_ASPECT_RATIO);
    assert.equal(imageFrame({ width: 1600, height: dimension }, "loading", "chat").box.aspectRatio, DEFAULT_IMAGE_ASPECT_RATIO);
  }
  assert.equal(imageFrame({}, "loading", "chat").box.aspectRatio, DEFAULT_IMAGE_ASPECT_RATIO);
});

test("clamps very tall and very wide aspect ratios", () => {
  const tall = imageFrame({ width: 1, height: 9000 }, "loading", "chat");
  const wide = imageFrame({ width: 9000, height: 1 }, "loading", "chat");
  assert.equal(tall.box.aspectRatio, MIN_IMAGE_ASPECT_RATIO);
  assert.equal(wide.box.aspectRatio, MAX_IMAGE_ASPECT_RATIO);
  assert.ok(tall.box.aspectRatio > 1 / 9000);
  assert.ok(wide.box.aspectRatio < 9000);
});

test("caps the chat height and leaves the artifact panel uncapped", () => {
  const card = { width: 400, height: 800 };
  const chat = imageFrame(card, "loading", "chat");
  const panel = imageFrame(card, "loading", "panel");
  assert.ok(Number.isFinite(CHAT_IMAGE_MAX_HEIGHT) && CHAT_IMAGE_MAX_HEIGHT > 0);
  assert.deepEqual(chat.box, { aspectRatio: 1 / 2, maxHeight: CHAT_IMAGE_MAX_HEIGHT });
  assert.deepEqual(panel.box, { aspectRatio: 1 / 2, maxHeight: null });
});

test("uses the title for empty alt text and Image when both are blank", () => {
  for (const alt of [undefined, "", " \n\t"]) {
    assert.equal(imageFrame({ alt, title: "  A\nmap  " }, "loaded", "chat").alt, "A map");
    assert.equal(imageFrame({ alt, title: " \t " }, "loaded", "chat").alt, "Image");
  }
  assert.equal(imageFrame({}, "loaded", "chat").alt, "Image");
});

test("trims alt text, puts it on one line, and caps its length", () => {
  const card = { alt: "  A path\r\n\tthrough\u2028the\u0085woods  ", title: "Unused" };
  assert.equal(imageFrame(card, "loaded", "chat").alt, "A path through the woods");

  const longAlt = "a".repeat(MAX_IMAGE_ALT_LENGTH + 10);
  assert.equal(imageFrame({ alt: longAlt }, "loaded", "chat").alt, "a".repeat(MAX_IMAGE_ALT_LENGTH));
});

test("preserves Hebrew and cuts only between complete graphemes", () => {
  const hebrew = "שָׁלוֹם עוֹלָם";
  assert.equal(imageFrame({ alt: ` ${hebrew} ` }, "loaded", "chat").alt, hebrew);

  const prefix = "א".repeat(MAX_IMAGE_ALT_LENGTH - 1);
  for (const next of ["שָׁ", "🌳"]) {
    assert.equal(imageFrame({ alt: prefix + next + " סוף" }, "loaded", "chat").alt, prefix);
  }
  assert.equal(imageFrame({ alt: prefix.slice(1) + "🌳 סוף" }, "loaded", "chat").alt, prefix.slice(1) + "🌳");
});

test("keeps the box through success and failure and shows a static fallback on failure", () => {
  const card = { alt: " A forest path ", width: 900, height: 1600 };
  for (const where of ["chat", "panel"] as const) {
    const { box } = imageFrame(card, "loading", where);
    assert.deepEqual(imageFrame(card, "loaded", where), { box, state: "loaded", alt: "A forest path" });
    assert.deepEqual(imageFrame(card, "failed", where), {
      box,
      state: "failed",
      alt: "A forest path",
      note: "Could not load image.",
      retry: false,
    });
  }
});

test("does not change the input card", () => {
  const original = { width: 1, height: 9000, alt: " \n ", title: "  A map  " };
  const card = Object.freeze({ ...original });
  imageFrame(card, "failed", "chat");
  assert.deepEqual(card, original);
});
