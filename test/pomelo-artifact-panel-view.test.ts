import { container, propsOf } from "./fake-dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloArtifactPanel } from "../src/client/pomelo/PomeloArtifactPanel.js";
import {
  ARTIFACT_PANEL_IDLE,
  artifactPanelReduce,
  type ArtifactPanelState,
} from "../src/client/pomelo/artifact-state.js";

const first = { artifactId: "sample", version: 1 };
const second = { ...first, version: 2 };
const html = "<p>First version</p>";
const title = "דוגמה לתצוגת מסמך";
const loading = artifactPanelReduce(ARTIFACT_PANEL_IDLE, { type: "open", ...first });
const ready = artifactPanelReduce(loading, { type: "loaded", ...first });
const refreshing = artifactPanelReduce(ready, { type: "open", ...second });
const refreshFailed = artifactPanelReduce(refreshing, { type: "failed", ...second });

const frame = /<iframe\b[^>]*>/g;
const retryButton = /<button\b[^>]*type="button"[^>]*>Try again<\/button>/g;

function render(state: ArtifactPanelState, props: Partial<Omit<ComponentProps<typeof PomeloArtifactPanel>, "state">> = {}) {
  return renderToStaticMarkup(createElement(PomeloArtifactPanel, { state, onRetry() {}, ...props }));
}

test("idle shows the idle label without a frame or retry button", () => {
  const state = artifactPanelReduce(ready, { type: "close" });
  const markup = render(state, { html, title });
  assert.ok(markup.includes(state.label));
  assert.doesNotMatch(markup, /<iframe\b|<button\b/);
});

test("ready draws one sandboxed frame with its HTML and the full Hebrew title", () => {
  const markup = render(ready, { html, title });
  const frames = markup.match(frame) ?? [];
  assert.equal(frames.length, 1);
  const sandbox = frames[0].match(/\bsandbox="([^"]*)"/);
  assert.ok(sandbox);
  assert.ok(!sandbox[1].split(/\s+/).includes("allow-same-origin"));
  assert.ok(frames[0].includes(`title="${title}"`));
  assert.ok(frames[0].includes("&lt;p&gt;First version&lt;/p&gt;"));
  assert.doesNotMatch(markup, /<button\b/);
});

test("loading with nothing shown reports that it is busy without drawing a frame", () => {
  const markup = render(loading, { html, title });
  assert.ok(markup.includes(loading.label));
  assert.match(markup, /aria-busy="true"/);
  assert.doesNotMatch(markup, /<iframe\b|<button\b/);
});

test("loading a new version shows the loading label above the older frame", () => {
  const markup = render(refreshing, { html, title });
  const frames = markup.match(frame) ?? [];
  assert.equal(frames.length, 1);
  assert.ok(frames[0].includes("&lt;p&gt;First version&lt;/p&gt;"));
  assert.ok(markup.indexOf(refreshing.label) >= 0);
  assert.ok(markup.indexOf(refreshing.label) < markup.indexOf("<iframe"));
  assert.match(markup, /aria-busy="true"/);
  assert.doesNotMatch(markup, /<button\b/);
});

for (const [type, expectedKind] of [
  ["not_found", "missing"],
  ["archived", "put_away"],
  ["too_big", "too_big"],
  ["failed", "failed"],
] as const) {
  test(`${expectedKind} shows its plain label without a frame`, () => {
    const state = artifactPanelReduce(loading, { type, ...first });
    assert.equal(state.kind, expectedKind);
    const markup = render(state, { html, title });
    assert.ok(markup.includes(state.label));
    assert.doesNotMatch(markup, /<iframe\b/);
    assert.equal(markup.match(/<button\b/g)?.length ?? 0, Number(state.canRetry));
    assert.equal(markup.match(retryButton)?.length ?? 0, Number(state.canRetry));
  });
}

test("a failed refresh keeps the mounted frame and offers one retry", async () => {
  const markup = render(refreshFailed, { html, title });
  assert.ok(refreshFailed.note && markup.includes(refreshFailed.note));
  assert.equal(markup.match(frame)?.length, 1);
  assert.equal(markup.match(retryButton)?.length, 1);

  const { createRoot } = await import("react-dom/client");
  const element = container();
  const root = createRoot(element as never);
  const onRetry = test.mock.fn();
  const props = { html, title, onRetry };
  try {
    await act(async () => root.render(createElement(PomeloArtifactPanel, { state: ready, ...props })));
    const shownFrame = element.all().find((node) => node.tagName === "IFRAME");
    assert.ok(shownFrame);

    for (const state of [refreshing, refreshFailed]) {
      await act(async () => root.render(createElement(PomeloArtifactPanel, { state, ...props })));
      assert.equal(element.all().find((node) => node.tagName === "IFRAME"), shownFrame);
    }

    const button = element.all().find((node) => node.tagName === "BUTTON");
    assert.ok(button);
    const { onClick } = propsOf(button);
    assert.ok(typeof onClick === "function");
    onClick();
    assert.equal(onRetry.mock.callCount(), 1);
  } finally {
    await act(async () => root.unmount());
    element.parentNode?.removeChild(element);
  }
});

test("the state's screen-reader line is announced by a polite live region", () => {
  for (const state of [ARTIFACT_PANEL_IDLE, loading, ready, refreshing, refreshFailed]) {
    const markup = render(state, { html, title });
    const liveLine = markup.match(/<([a-z]+)\b[^>]*aria-live="polite"[^>]*>([^<]*)<\/\1>/)?.[2];
    assert.equal(liveLine, state.screenReaderLine);
  }
});

test("ready without an HTML body shows the loading words and no frame", () => {
  for (const body of [undefined, ""]) {
    const markup = render(ready, { html: body, title });
    assert.ok(markup.includes(loading.label));
    assert.doesNotMatch(markup, /<iframe\b|<button\b/);
  }
});
