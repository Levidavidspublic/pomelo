import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { diagramKeyAction, PomeloDiagramCard } from "../src/client/pomelo/PomeloDiagramCard.js";
import { cardLabel } from "../src/client/pomelo/card-label.js";
import { checkDiagramSource } from "../src/client/pomelo/diagram-source.js";
import { applyViewAction, fitView, viewStyle } from "../src/client/pomelo/diagram-view.js";

const geometry = { frame: { width: 300, height: 180 }, diagram: { width: 200, height: 100 } };
const flowchart = "flowchart LR\n  A[Start] --> B[Finish]";
const hebrewFlowchart = "flowchart LR\n  A[התחלה] --> B[סיום]";
const drawn = createElement("span", null, "Drawing fixture");

function render(props: Pick<ComponentProps<typeof PomeloDiagramCard>, "source" | "drawn" | "title" | "reducedMotion">): string {
  const html = renderToStaticMarkup(createElement(PomeloDiagramCard, { ...geometry, ...props }));
  assert.doesNotMatch(html, /<script\b|\bhref\s*=|#[0-9a-f]{3,8}\b|\banimation\b/i);
  return html;
}

function imageTag(html: string): string {
  const tag = html.match(/<div\b[^>]*\brole="img"[^>]*>/)?.[0];
  assert.ok(tag);
  return tag;
}

test("renders a focusable diagram named by the card label with three plain-text controls", () => {
  const title = "Review flow";
  const html = render({ source: flowchart, title, drawn });
  const { label } = cardLabel({ kind: "diagram", title });
  assert.match(html, /<figure\b[^>]*style="background-color:var\(--card\);color:var\(--ink\);border-color:var\(--border\)"/);
  assert.ok(imageTag(html).includes(`aria-label="${label}"`));
  assert.match(imageTag(html), /\btabindex="0"/i);
  assert.match(imageTag(html), /\bdir="ltr"/);
  assert.doesNotMatch(html, /\bautofocus\b|<pre\b/i);
  assert.match(html, /<span>Drawing fixture<\/span>/);
  assert.deepEqual(Array.from(html.matchAll(/<button\b[^>]*style="border-color:var\(--border\)"[^>]*>([^<]+)<\/button>/g), ([, text]) => text), [
    "Zoom in", "Zoom out", "Fit",
  ]);
  assert.equal(html.match(/<button\b/g)?.length, 3);
  assert.ok(html.includes(`transform:${viewStyle(fitView(geometry)).transform};transform-origin:0 0`));
});

test("uses RTL for a Hebrew drawing and LTR for its source fallback", () => {
  const title = "תרשים תהליך";
  const tag = imageTag(render({ source: hebrewFlowchart, title, drawn }));
  assert.match(tag, /\bdir="rtl"/);
  assert.ok(tag.includes(`aria-label="${cardLabel({ kind: "diagram", title }).label}"`));
  assert.match(render({ source: hebrewFlowchart }), /<pre\b[^>]*\bdir="ltr"[^>]*>/);
});

test("shows the source check's reason and fallback text for a click callback", () => {
  const source = `${flowchart}\n  click A callback`;
  const check = checkDiagramSource(source);
  assert.equal(check.ok, false);
  const html = render({ source, drawn });
  assert.ok(html.includes(check.reason));
  const fallback = html.match(/<pre\b[^>]*\bdir="ltr"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
  assert.equal(fallback, check.fallbackText.replaceAll(">", "&gt;"));
  assert.doesNotMatch(html, /Drawing fixture|role="img"|<button\b/);
});

test("shows the original source and a reason while a safe diagram has no drawing", () => {
  const html = render({ source: flowchart });
  assert.match(html, /<p\b[^>]*style="color:var\(--ink-2\)"[^>]*>The diagram has not been drawn yet\.<\/p>/);
  assert.equal(html.match(/<pre\b[^>]*\bdir="ltr"[^>]*>([\s\S]*?)<\/pre>/)?.[1], flowchart.replaceAll(">", "&gt;"));
  assert.doesNotMatch(html, /role="img"|<button\b/);
});

test("escapes a script tag in the title and uses the plain card label for the drawing", () => {
  const html = render({ source: flowchart, title: "Review <script>", drawn });
  assert.match(html, /Review &lt;script&gt;/);
  assert.match(imageTag(html), /\baria-label="Diagram: Review"/);
});

test("disables the diagram transform transition when reduced motion is requested", () => {
  const html = render({ source: flowchart, drawn, reducedMotion: true });
  assert.match(html, /transform-origin:0 0;transition:none/);
});

test("maps zoom and movement keys to the diagram view model", () => {
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "0"]) {
    assert.deepEqual(diagramKeyAction(key), { type: "key", key });
  }
  for (const key of ["Tab", "Enter", "Escape", "="]) {
    assert.equal(diagramKeyAction(key), null);
  }
  const shiftPan = diagramKeyAction("ArrowRight", true);
  assert.ok(shiftPan);
  const initial = fitView(geometry);
  assert.equal(applyViewAction(initial, shiftPan, geometry).x, initial.x + 96);
});
