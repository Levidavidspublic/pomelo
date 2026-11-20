import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloPanelTabs, tabKeyTarget } from "../src/client/pomelo/PomeloPanelTabs.js";
import { separatorProps } from "../src/client/pomelo/panel-resize.js";
import { SIDE_PANELS } from "../src/client/pomelo/side-panel.js";

function render(overrides: Partial<ComponentProps<typeof PomeloPanelTabs>> = {}) {
  return renderToStaticMarkup(createElement(PomeloPanelTabs, {
    available: SIDE_PANELS,
    active: "artifact",
    width: 420,
    viewport: 1200,
    dir: "ltr",
    onSelect: () => assert.fail("Rendering should never select a panel"),
    onResize: () => assert.fail("Rendering should never resize the panel"),
    ...overrides,
  }));
}

function tabs(html: string) {
  return [...html.matchAll(/(<button\b[^>]*\brole="tab"[^>]*>)([\s\S]*?)<\/button>/g)];
}

function tabLabels(html: string) {
  return tabs(html).map(([, , content]) => content!.replace(/<[^>]+>/g, "").trim());
}

test("tabs have plain labels in model order and only the open tab is selected and tabbable", () => {
  const html = render({ available: ["work", "browser", "artifact"] });
  assert.equal([...html.matchAll(/role="tablist"/g)].length, 1);
  assert.deepEqual(tabLabels(html), ["Browser", "Artifact", "Work"]);
  tabs(html).forEach(([, tag], index) => {
    const selected = index === 1;
    assert.match(tag!, /type="button"/);
    assert.ok(tag!.includes(`aria-selected="${selected}"`));
    assert.ok(tag!.includes(`tabindex="${selected ? 0 : -1}"`));
    if (selected) assert.match(tag!, /aria-description="Open panel"/);
    else assert.doesNotMatch(tag!, /aria-description=/);
  });
});

test("only available tabs are drawn, and an empty panel list renders nothing", () => {
  const html = render({ available: ["artifact", "work"] });
  assert.deepEqual(tabLabels(html), ["Artifact", "Work"]);
  assert.doesNotMatch(html, /Browser/);
  assert.equal(render({ available: [] }), "");
});

test("the focusable resize handle reports the model's width and limits", () => {
  const width = 900;
  const viewport = 1120;
  const expected = separatorProps(width, viewport);
  const handles = [...render({ width, viewport }).matchAll(/<[^>]+\brole="separator"[^>]*>/g)];
  assert.equal(handles.length, 1);
  const tag = handles[0]![0];
  assert.match(tag, /aria-label="Resize side panel"/);
  for (const [name, value] of Object.entries(expected)) {
    assert.ok(tag.includes(`${name.toLowerCase()}="${value}"`), `Missing separator property ${name}`);
  }
});

test("RTL keeps the plain labels and sets direction on the wrapper", () => {
  const html = render({ dir: "rtl" });
  assert.match(html, /^<div\b[^>]*\bdir="rtl"/);
  assert.deepEqual(tabLabels(html), ["Browser", "Artifact", "Work"]);
  assert.doesNotMatch(html, /\bautofocus\b|<input\b[^>]*\btype="password"|\bstyle="[^"]*animation/i);
});

test("arrow navigation follows the model order and wraps in both directions", () => {
  assert.equal(tabKeyTarget("ArrowRight", "artifact", SIDE_PANELS, "ltr"), "work");
  assert.equal(tabKeyTarget("ArrowLeft", "artifact", SIDE_PANELS, "ltr"), "browser");
  assert.equal(tabKeyTarget("ArrowRight", "work", SIDE_PANELS, "ltr"), "browser");
  assert.equal(tabKeyTarget("ArrowLeft", "browser", SIDE_PANELS, "ltr"), "work");
  assert.equal(tabKeyTarget("ArrowRight", "artifact", SIDE_PANELS, "rtl"), "browser");
  assert.equal(tabKeyTarget("ArrowLeft", "artifact", SIDE_PANELS, "rtl"), "work");
  assert.equal(tabKeyTarget("ArrowRight", "browser", SIDE_PANELS, "rtl"), "work");
  assert.equal(tabKeyTarget("ArrowLeft", "work", SIDE_PANELS, "rtl"), "browser");
  assert.equal(tabKeyTarget("ArrowDown", "artifact", SIDE_PANELS, "rtl"), "work");
  assert.equal(tabKeyTarget("ArrowUp", "artifact", SIDE_PANELS, "rtl"), "browser");
});

test("navigation skips unavailable panels and Home and End use the model's edges", () => {
  const available = ["work", "artifact"] as const;
  for (const dir of ["ltr", "rtl"] as const) {
    assert.equal(tabKeyTarget("Home", "work", available, dir), "artifact");
    assert.equal(tabKeyTarget("End", "artifact", available, dir), "work");
  }
  assert.equal(tabKeyTarget("ArrowRight", "work", available, "ltr"), "artifact");
  assert.equal(tabKeyTarget("ArrowLeft", "artifact", available, "ltr"), "work");
  assert.equal(tabKeyTarget("ArrowRight", "browser", available, "ltr"), "artifact");
  assert.equal(tabKeyTarget("ArrowLeft", null, available, "ltr"), "work");
  assert.equal(tabKeyTarget("ArrowRight", "work", ["work"], "ltr"), "work");
  assert.equal(tabKeyTarget("Home", null, [], "rtl"), null);
  assert.equal(tabKeyTarget("Tab", "artifact", available, "rtl"), null);
});
