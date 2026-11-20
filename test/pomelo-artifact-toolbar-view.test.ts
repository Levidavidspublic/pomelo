import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { Children, createElement, isValidElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloArtifactToolbar } from "../src/client/pomelo/PomeloArtifactToolbar.js";
import { artifactToolbar } from "../src/client/pomelo/artifact-toolbar.js";

type ToolbarProps = ComponentProps<typeof PomeloArtifactToolbar>;

const props: ToolbarProps = {
  kind: "html",
  title: "Sample artifact",
  version: 2,
  latest: 3,
  onCopy: () => {},
  onDownload: () => {},
  onOpenInWindow: () => {},
  onPickVersion: () => {},
};

function render(overrides: Partial<ToolbarProps> = {}) {
  return renderToStaticMarkup(createElement(PomeloArtifactToolbar, { ...props, ...overrides }));
}

test("the toolbar has labeled native controls and leaves focus alone", () => {
  const html = render();
  assert.match(html, /^<div\b[^>]*\brole="toolbar"[^>]*\baria-label="Artifact actions"/);
  assert.equal([...html.matchAll(/<button\b[^>]*>/g)].length, 3);
  assert.equal([...html.matchAll(/<button\b[^>]*\btype="button"[^>]*>/g)].length, 3);
  assert.equal([...html.matchAll(/<select\b[^>]*>/g)].length, 1);
  assert.match(html, /<label\b[^>]*>Version<select\b[^>]*>.*<\/select><\/label>/);
  assert.match(html, /<button\b[^>]*>Copy source<\/button>/);
  assert.match(html, /<button\b(?![^>]*\sdisabled=")[^>]*>Open in window<\/button>/);
  assert.doesNotMatch(html, /\bautofocus\b/i);
  assert.match(render({ kind: "image" }), /<button\b[^>]*>Copy image<\/button>/);
});

test("the Download name uses the model's filename for Hebrew and path punctuation", () => {
  for (const title of ["דוח 2026 / סיכום", "../../sample.../file..."]) {
    const { fileName } = artifactToolbar({ ...props, title }).download;
    const html = render({ title });
    const name = html.match(/<button\b[^>]*\baria-label="(Download [^"]+)"/)?.[1];
    assert.equal(name, `Download ${fileName}`);
    assert.ok(!html.includes(title));
  }

  assert.match(render({ title: "דוח שבועי" }), /<bdi\b[^>]*>דוח-שבועי-v2\.html<\/bdi>/);
});

test("a model that disallows opening shows a disabled button and its reason", async () => {
  // The real model enables opening for every kind. Override it only for this import.
  const modelUrl = new URL("../src/client/pomelo/artifact-toolbar.ts", import.meta.url).href;
  const windowDisabledModel = `
    import { artifactToolbar as realToolbar } from ${JSON.stringify(modelUrl)};
    export function artifactToolbar(input) {
      const toolbar = realToolbar(input);
      return { ...toolbar, openInWindow: { ...toolbar.openInWindow, enabled: false } };
    }
  `;
  const modelFixture = `data:text/javascript,${encodeURIComponent(windowDisabledModel)}`;
  register(`data:text/javascript,${encodeURIComponent(`
    export function resolve(specifier, context, next) {
      if (/^\\.\\/artifact-toolbar\\.[jt]s$/.test(specifier) && context.parentURL?.endsWith("?window-disabled")) {
        return { url: ${JSON.stringify(modelFixture)}, shortCircuit: true };
      }
      return next(specifier, context);
    }
  `)}`);
  const toolbarUrl = new URL("../src/client/pomelo/PomeloArtifactToolbar.tsx?window-disabled", import.meta.url);
  const { PomeloArtifactToolbar: ToolbarWithDisabledWindow }: typeof import("../src/client/pomelo/PomeloArtifactToolbar.js") =
    await import(toolbarUrl.href);
  const html = renderToStaticMarkup(createElement(ToolbarWithDisabledWindow, props));
  assert.match(html, /<button\b[^>]*\sdisabled=""[^>]*>Open in window<span> \(Unavailable for this artifact\)<\/span><\/button>/);
});

test("the picker follows the model's order, selection, and latest label", () => {
  const html = render();
  assert.deepEqual(html.match(/<option\b[^>]*>[^<]*<\/option>/g), [
    '<option value="3">v3 (latest)</option>',
    '<option value="2" selected="">v2</option>',
    '<option value="1">v1</option>',
  ]);
  assert.doesNotMatch(render({ version: 1, latest: 1 }), /<select\b/);

  const fallback = render({ version: 4 });
  assert.match(fallback, /<option value="3" selected="">v3 \(latest\)<\/option>/);
  assert.match(fallback, /aria-label="Download Sample-artifact-v3\.html"/);
});

test("clicking Download passes the model's filename and MIME type to the callback", (t) => {
  const onDownload = t.mock.fn<ToolbarProps["onDownload"]>();
  const input = { ...props, kind: "image" as const, title: "דוגמה / chart", onDownload };
  const { fileName, mime } = artifactToolbar(input).download;
  const toolbar = PomeloArtifactToolbar(input);
  const download = Children.toArray(toolbar.props.children).find(
    (child) => isValidElement<ComponentProps<"button">>(child) && child.props["aria-label"] === `Download ${fileName}`,
  );
  assert.ok(isValidElement<ComponentProps<"button">>(download));
  assert.ok(download.props.onClick);
  Reflect.apply(download.props.onClick, undefined, []);
  assert.deepEqual(onDownload.mock.calls.map((call) => call.arguments), [[fileName, mime]]);
});
