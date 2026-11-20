import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloImageViewer, viewerStep } from "../src/client/pomelo/PomeloImageViewer.js";
import {
  openViewer,
  viewerLabel,
  viewerReduce,
  type ViewerAction,
  type ViewerFallback,
  type ViewerPicture,
  type ViewerState,
} from "../src/client/pomelo/image-viewer.js";

const picture = {
  id: "harbor",
  width: 800,
  height: 400,
  source: { mode: "show", src: "/api/harbor.png", alt: "A view of the harbor" } as const,
};
const second = {
  ...picture,
  id: "mountain",
  source: { mode: "show", src: "/api/mountain.png", alt: "A view of the mountain" } as const,
};
const remote = "https://example.invalid/picture.png";

function opened(replyPictures: readonly ViewerPicture[] = [picture]): ViewerState {
  const state = openViewer({ ...picture, replyPictures, viewport: { width: 400, height: 300 } });
  assert.ok(state.open);
  return state;
}

function update(state: ViewerState, action: ViewerAction): ViewerState {
  const result = viewerReduce(state, action);
  assert.ok("open" in result);
  return result;
}

function render(state: ViewerState | ViewerFallback, linkHref?: string): string {
  return renderToStaticMarkup(createElement(PomeloImageViewer, {
    state,
    linkHref,
    onChange: () => assert.fail("Rendering should not change the viewer"),
    onClose: () => assert.fail("Rendering should not close the viewer"),
  }));
}

function buttonsByLabel(html: string): Map<string, string> {
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  return new Map(buttons.map((button) => {
    const label = button.match(/\baria-label="([^"]+)"/)?.[1];
    assert.ok(label, "Every viewer button needs a label");
    return [label, button];
  }));
}

test("shows a named modal dialog with the model's picture and six labeled controls", () => {
  const html = render(opened());
  const dialog = html.match(/<dialog\b[^>]*>/)?.[0];
  assert.ok(dialog);
  assert.match(dialog, /\brole="dialog"/);
  assert.match(dialog, /\baria-modal="true"/);
  assert.match(dialog, /\baria-label="Picture viewer"/);
  const images = html.match(/<img\b[^>]*>/g) ?? [];
  assert.equal(images.length, 1);
  assert.match(images[0], /\bsrc="\/api\/harbor\.png"/);
  assert.ok(images[0].includes(`alt="${picture.source.alt}"`));

  const buttons = buttonsByLabel(html);
  assert.equal((html.match(/<button\b/g) ?? []).length, 6);
  assert.deepEqual([...buttons.keys()].sort(), [
    "Close", "Fit to window", "Next picture", "Previous picture", "Zoom in", "Zoom out",
  ]);
  assert.match(buttons.get("Previous picture")!, / disabled=""/);
  assert.match(buttons.get("Next picture")!, / disabled=""/);
});

test("enables navigation toward the other picture and announces its position", () => {
  const start = opened([picture, second]);
  const first = buttonsByLabel(render(start));
  assert.match(first.get("Previous picture")!, / aria-disabled="true"/);
  assert.doesNotMatch(first.get("Next picture")!, / (?:aria-)?disabled=/);

  const state = update(start, { type: "next" });
  const html = render(state);
  const last = buttonsByLabel(html);
  assert.doesNotMatch(last.get("Previous picture")!, / (?:aria-)?disabled=/);
  assert.match(last.get("Next picture")!, / aria-disabled="true"/);
  assert.match(html, /<img\b[^>]*\bsrc="\/api\/mountain\.png"/);
  assert.equal(html.match(/aria-live="polite"[^>]*>([^<]+)/)?.[1], viewerLabel(state));
});

test("draws the fitted size, zoom and offsets and announces the zoom without animation", () => {
  const zoomed = update(opened(), { type: "zoom-in" });
  const state = update(zoomed, { type: "pan", dx: 32, dy: -24 });
  const html = render(state);
  const style = html.match(/<img\b[^>]*\bstyle="([^"]+)"/)?.[1];
  assert.ok(style);
  assert.ok(style.includes(`width:${picture.width * state.fitScale}px`));
  assert.ok(style.includes(`height:${picture.height * state.fitScale}px`));
  assert.ok(style.includes(`transform:translate(${state.x}px, ${state.y}px) scale(${state.zoom})`));
  assert.equal(html.match(/aria-live="polite"[^>]*>([^<]+)/)?.[1], viewerLabel(state));
  assert.doesNotMatch(html, /\banimate-|\banimation(?:-[\w-]+)?:|\binfinite\b/i);
});

test("renders a remote fallback as one link with no image or preload", () => {
  const state = openViewer({
    ...picture,
    source: { mode: "link", href: remote, alt: picture.source.alt, reason: "remote" },
  });
  assert.ok(!state.open);
  const html = render(state, remote);
  assert.match(html, /^<a\b[^>]*>[^<]+<\/a>$/);
  assert.ok(html.includes(`href="${remote}"`));
  assert.match(html, /\brel="noopener noreferrer"/);
  assert.match(html, /\btarget="_blank"/);
  assert.doesNotMatch(html, /<img\b|rel="preload"/);
  assert.equal(render(state), "");
});

test("never embeds a remote source even if the caller passes it in an open state", () => {
  const state = opened();
  for (const src of [remote, "//example.invalid/picture.png"]) {
    const html = render({ ...state, pictures: [{ ...state.pictures[0], src }] }, remote);
    assert.match(html, /^<a\b[^>]*>[^<]+<\/a>$/);
    assert.doesNotMatch(html, /<img\b|rel="preload"/);
  }
});

test("keyboard commands use the model's zoom, pan, fit and navigation actions", () => {
  const state = update(opened([picture, second]), { type: "zoom-in" });
  const commands: [string, ViewerAction][] = [
    ["+", { type: "zoom-in" }],
    ["-", { type: "zoom-out" }],
    ["0", { type: "reset" }],
    ["ArrowLeft", { type: "pan", dx: -32, dy: 0 }],
    ["ArrowRight", { type: "pan", dx: 32, dy: 0 }],
    ["ArrowUp", { type: "pan", dx: 0, dy: -32 }],
    ["ArrowDown", { type: "pan", dx: 0, dy: 32 }],
    ["PageDown", { type: "next" }],
  ];
  for (const [key, action] of commands) {
    assert.deepEqual(viewerStep(state, key), viewerReduce(state, action), key);
  }
  const next = update(state, { type: "next" });
  assert.deepEqual(viewerStep(next, "PageUp"), viewerReduce(next, { type: "previous" }));
  assert.equal(viewerStep(state, "Tab"), state);
});

test("Escape returns the model's closed value with the original card id after navigation", () => {
  const state = update(opened([picture, second]), { type: "next" });
  const closed = viewerStep(state, "Escape");
  assert.deepEqual(closed, viewerReduce(state, { type: "close" }));
  assert.deepEqual(closed, { closed: true, focusCardId: picture.id });
});
