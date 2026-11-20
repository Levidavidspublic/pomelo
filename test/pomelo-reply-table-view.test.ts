import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloReplyTable } from "../src/client/pomelo/PomeloReplyTable.js";
import { REPLY_TABLE_ROW_LIMIT } from "../src/client/pomelo/reply-table.js";

function render(input: Omit<ComponentProps<typeof PomeloReplyTable>, "onShowAll">) {
  return renderToStaticMarkup(createElement(PomeloReplyTable, {
    ...input,
    onShowAll: () => assert.fail("Rendering should never expand the table"),
  }));
}

const longRows = Array.from({ length: REPLY_TABLE_ROW_LIMIT + 3 }, (_, index) => [`Item ${index + 1}`]);

test("an English table renders all cells and their directions", () => {
  const html = render({ header: ["Fruit", "Count"], rows: [["Pomelo", "2"], ["Lime", "3"]], messageDir: "ltr" });
  assert.match(html, /<table\b[^>]*dir="ltr"/);
  const headings = [...html.matchAll(/<th\b([^>]*)>([^<]*)<\/th>/g)];
  assert.deepEqual(headings.map(([, , text]) => text), ["Fruit", "Count"]);
  for (const [, attributes] of headings) {
    assert.match(attributes!, /\bscope="col"/);
    assert.match(attributes!, /\bdir="auto"/);
  }
  const cells = [...html.matchAll(/<td\b[^>]*dir="([^"]+)"[^>]*>([^<]*)<\/td>/g)];
  assert.deepEqual(cells.map(([, dir, text]) => [dir, text]), [
    ["auto", "Pomelo"], ["ltr", "2"], ["auto", "Lime"], ["ltr", "3"],
  ]);
  assert.doesNotMatch(html, /<button\b/);
});

test("a Hebrew table keeps numbers and code left to right", () => {
  const html = render({
    header: ["פרי", "כמות", "קוד"],
    rows: [["פומלה", "-2.5", "`count++`"]],
    messageDir: "rtl",
  });
  assert.match(html, /<table\b[^>]*dir="rtl"/);
  assert.match(html, /<th\b[^>]*dir="auto"[^>]*>פרי<\/th>/);
  assert.match(html, /<td\b[^>]*dir="auto"[^>]*>פומלה<\/td>/);
  assert.match(html, /<td\b[^>]*dir="ltr"[^>]*>-2\.5<\/td>/);
  assert.match(html, /<td\b[^>]*dir="ltr"[^>]*>`count\+\+`<\/td>/);
});

test("a folded table shows only the visible rows and one button with the hidden count", () => {
  const html = render({ header: ["Fruit"], rows: longRows, messageDir: "ltr" });
  const cells = [...html.matchAll(/<td\b[^>]*>([^<]*)<\/td>/g)];
  assert.deepEqual(cells.map(([, text]) => [text]), longRows.slice(0, REPLY_TABLE_ROW_LIMIT));
  const buttons = [...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)];
  assert.equal(buttons.length, 1);
  assert.match(buttons[0]![1]!, /\btype="button"/);
  assert.match(buttons[0]![2]!, new RegExp(`Show all ${longRows.length} rows`));
  assert.match(buttons[0]![2]!, /\b3 hidden\b/);
});

test("an expanded table shows every row and removes the button", () => {
  const html = render({ header: ["Fruit"], rows: longRows, messageDir: "ltr", expanded: true });
  const cells = [...html.matchAll(/<td\b[^>]*>([^<]*)<\/td>/g)];
  assert.deepEqual(cells.map(([, text]) => [text]), longRows);
  assert.doesNotMatch(html, /<button\b/);
});

test("the table sits inside a focusable scroll region named with the full dimensions", () => {
  const html = render({ header: ["Fruit", "Color"], rows: longRows, messageDir: "ltr" });
  const region = html.match(/<div\b[^>]*role="region"[^>]*>(?=<table\b)/)?.[0];
  assert.ok(region);
  assert.match(region, /\btabindex="0"/i);
  assert.match(region, /\bclass="[^"]*\boverflow-x-auto\b/);
  assert.ok(region.includes(`aria-label="Table, 2 columns, ${longRows.length} rows: Fruit, Color"`));
});

test("an empty table model renders nothing", () => {
  assert.equal(render({ header: [], rows: [[]], messageDir: "auto" }), "");
});

test("markup in headers and cells is escaped as text", () => {
  const html = render({ header: ["<script>heading</script>"], rows: [["<script>cell</script>"]], messageDir: "ltr" });
  assert.match(html, />&lt;script&gt;heading&lt;\/script&gt;<\/th>/);
  assert.match(html, />&lt;script&gt;cell&lt;\/script&gt;<\/td>/);
  assert.doesNotMatch(html, /<\/?script\b/i);
});
