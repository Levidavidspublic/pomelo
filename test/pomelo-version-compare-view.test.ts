import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloVersionCompare, type PomeloVersionCompareProps } from "../src/client/pomelo/PomeloVersionCompare.js";
import { compareVersions } from "../src/client/pomelo/version-compare.js";

const options = { kind: "html", maxLines: 100 } as const;

function render(result: PomeloVersionCompareProps["result"], onShowFold?: PomeloVersionCompareProps["onShowFold"]): string {
  return renderToStaticMarkup(createElement(PomeloVersionCompare, { result, fromVersion: 7, toVersion: 12, onShowFold }));
}

test("shows the model summary before the rows and labels the versions being compared", () => {
  const result = compareVersions("before", "after", options);
  assert.equal(result.status, "ready");

  const html = render(result);
  assert.match(html, /aria-label="Compare version 7 to version 12"/);
  const summaryIndex = html.indexOf(`>${result.summary}</`);
  assert.ok(summaryIndex >= 0 && summaryIndex < html.indexOf("<li "));
});

test("shows a replacement as a signed removal with its old line number followed by a signed addition with its new line number", () => {
  const result = compareVersions("start\nobsolete\nanchor\nbefore", "start\nanchor\nafter", options);
  const rows = render(result).match(/<li\b[^>]*>.*?<\/li>/g) ?? [];
  const removed = rows.findIndex((row) => row.includes(">before</code>"));
  const added = rows.findIndex((row) => row.includes(">after</code>"));

  assert.ok(removed >= 0);
  assert.equal(added, removed + 1);
  assert.match(rows[removed], /^<li\b[^>]*><span\b[^>]*>-<\/span><span class="sr-only">removed\s*<\/span><span\b[^>]*>4<\/span>/);
  assert.match(rows[added], /^<li\b[^>]*><span\b[^>]*>\+<\/span><span class="sr-only">added\s*<\/span><span\b[^>]*>3<\/span>/);
});

test("renders one button with the model's count for a folded unchanged run", () => {
  const shared = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
  const result = compareVersions(`${shared}\nbefore`, `${shared}\nafter`, options);
  const fold = result.rows.find((row) => row.type === "fold");
  assert.ok(fold?.type === "fold");

  const html = render(result, () => {});
  assert.equal(html.match(/<button\b/g)?.length, 1);
  assert.match(html, new RegExp(`<button\\b[^>]*\\btype="button"[^>]*>Show ${fold.count} unchanged lines</button>`));
  assert.doesNotMatch(html, /\bdisabled\b|autofocus|animate-pulse|animate-spin/i);
});

test("renders identical bodies as no changes with plain unchanged rows", () => {
  const html = render(compareVersions("first\nlast", "first\nlast", options));
  assert.match(html, />No changes</);
  assert.match(html, />1<\/span><code\b[^>]*>first<\/code>/);
  assert.match(html, />2<\/span><code\b[^>]*>last<\/code>/);
  assert.doesNotMatch(html, />[+-]</);
});

test("renders only the model's fallback reason for an image", () => {
  const result = compareVersions("image one", "image two", { ...options, kind: "image" });
  assert.equal(result.status, "fallback");
  assert.equal(render(result), `<p>${result.reason}</p>`);
});

test("renders only the model's fallback reason for an oversized artifact", () => {
  const result = compareVersions("small", "x".repeat(256 * 1024 + 1), options);
  assert.equal(result.status, "fallback");
  assert.equal(render(result), `<p>${result.reason}</p>`);
});

test("keeps Hebrew lines left to right and escapes artifact tags as text", () => {
  const html = render(compareVersions("", "שלום\n<script>", options));
  assert.match(html, /<code\b[^>]*\bdir="ltr"[^>]*>שלום<\/code>/);
  assert.match(html, /<code\b[^>]*>&lt;script&gt;<\/code>/);
  assert.doesNotMatch(html, /<script\b/i);
});
