import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloTagChips, type PomeloTagChipsProps } from "../src/client/pomelo/PomeloTagChips.js";
import { tagColour } from "../src/client/pomelo/tag-colour.js";

const render = (props: PomeloTagChipsProps) => renderToStaticMarkup(createElement(PomeloTagChips, props));
const chips = (html: string) => html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];

test("a list shows two project chips and names the hidden project on the more chip", () => {
  const html = render({ tags: ["design", "docs", "release"], labels: { release: "Release Planning" }, maxChips: 2 });
  assert.match(html, /^<ul\b[^>]*>[\s\S]*<\/ul>$/);
  const items = chips(html);
  assert.equal(items.length, 3);
  const [design, docs, more] = items;
  assert.match(design, />design</);
  assert.match(docs, />docs</);
  assert.match(more, />\+1 more</);
  assert.match(more, /aria-label="\+1 more: Release Planning"/);
});

test("the colours use each slug and optional override, and direction follows the displayed label", () => {
  const colours = { design: "#ABCDEF" };
  const html = render({ tags: ["design", "docs"], labels: { design: "עיצוב", docs: "Documentation" }, colours, maxChips: 2 });
  const items = chips(html);
  assert.equal(items.length, 2);
  const [design, docs] = items;
  assert.match(design, /dir="rtl"[^>]*>עיצוב</);
  assert.match(docs, /dir="ltr"[^>]*>Documentation</);
  assert.doesNotMatch(html, />design<|>docs</);
  for (const [chip, slug, colour] of [[design, "design", colours.design], [docs, "docs"]] as const) {
    const { bg, fg } = tagColour(slug, colour);
    assert.ok(chip.includes(`style="background-color:${bg};color:${fg}"`));
  }
});

test("overflow names only hidden projects and preserves punctuation and Hebrew", () => {
  const html = render({
    tags: ["design, review", "DESIGN, REVIEW", "docs, draft", "release"],
    labels: { "docs, draft": "Documentation, draft", release: "תכנון השקה" },
    maxChips: 1,
  });
  const items = chips(html);
  assert.equal(items.length, 2);
  assert.match(items[1], /aria-label="\+2 more: Documentation, draft, תכנון השקה"/);
  assert.match(items[1], /dir="ltr"[^>]*>\+2 more</);
});

test("empty or non-array tags render nothing", () => {
  assert.equal(render({ tags: [], maxChips: 2 }), "");
  assert.equal(render({ tags: "design", maxChips: 2 }), "");
});

test("markup in a label is escaped in visible and overflow chips", () => {
  const props = { tags: ["sample"], labels: { sample: "<script>example</script>" } };
  const visible = render({ ...props, maxChips: 1 });
  const hidden = render({ ...props, maxChips: 0 });
  assert.match(visible, />&lt;script&gt;example&lt;\/script&gt;</);
  assert.match(hidden, /aria-label="\+1 more: &lt;script&gt;example&lt;\/script&gt;"/);
  assert.doesNotMatch(visible + hidden, /<script\b/);
});
