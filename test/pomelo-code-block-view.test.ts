import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CODE_BLOCK_FOLD_LIMIT, codeBlockModel, unfoldCodeBlock, withCopyResult, type CodeBlockModel,
} from "../src/client/pomelo/code-block.js";
import { PomeloCodeBlock } from "../src/client/pomelo/PomeloCodeBlock.js";

function render(model: CodeBlockModel) {
  return renderToStaticMarkup(createElement(PomeloCodeBlock, { model, onCopy() {}, onShowAll() {} }));
}

function codeText(html: string) {
  return html.match(/<pre\b[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
}

test("renders the exact code once with its language and a focusable left-to-right pane", () => {
  const text = "\n  const total = 2;\n\t// keep whitespace  \n";
  const html = render(codeBlockModel({ text, info: "ts" }));

  assert.match(html, /^<figure\b[^>]*\bdir="ltr"/);
  assert.match(html, /<figcaption\b[^>]*>.*>TypeScript</);
  assert.match(html, /<pre\b[^>]*\btabindex="0"/i);
  assert.equal(codeText(html), text);
  assert.equal(html.split(text).length, 2);
  assert.deepEqual(Array.from(html.matchAll(/<button\b[^>]*type="button"[^>]*>(.*?)<\/button>/g), (match) => match[1]), ["copy"]);
});

test("escapes markup and ampersands in the code", () => {
  const html = render(codeBlockModel({ text: "<script>example & example</script>", info: "html" }));

  assert.equal(codeText(html), "&lt;script&gt;example &amp; example&lt;/script&gt;");
  assert.doesNotMatch(html, /<\/?script\b/);
});

test("shows one show-all button for folded code and the full text after unfolding", () => {
  const preview = Array.from({ length: CODE_BLOCK_FOLD_LIMIT }, (_, index) => `// line ${index + 1}`).join("\n");
  const text = `${preview}\n// last line\n`;
  const model = codeBlockModel({ text });
  const folded = render(model);

  assert.equal(codeText(folded), preview);
  assert.doesNotMatch(folded, /last line/);
  assert.deepEqual(Array.from(folded.matchAll(/<button\b[^>]*type="button"[^>]*>(.*?)<\/button>/g), (match) => match[1]), [
    "copy", `show all ${CODE_BLOCK_FOLD_LIMIT + 1} lines`,
  ]);

  const unfolded = render(unfoldCodeBlock(model));
  assert.equal(codeText(unfolded), text);
  assert.doesNotMatch(unfolded, /show all/);
  assert.equal(unfolded.match(/<button\b/g)?.length, 1);
});

test("announces copy success and failure in the status line", () => {
  const model = codeBlockModel({ text: "example" });

  assert.match(render(model), /role="status"[^>]*><\//);
  for (const [result, label] of [["success", "copied"], ["failure", "could not copy"]] as const) {
    const html = render(withCopyResult(model, result));
    assert.equal(html.match(/<button\b[^>]*>(.*?)<\/button>/)?.[1], label);
    assert.equal(html.match(/role="status"[^>]*>(.*?)<\//)?.[1], label);
  }
});

test("disables the copy button for an empty block", () => {
  const html = render(codeBlockModel({ text: "" }));

  assert.equal(codeText(html), "");
  assert.match(html, /<button\b[^>]*\bdisabled=""[^>]*>copy<\/button>/);
});

test("keeps Hebrew code intact in a right-to-left reply", () => {
  const text = "// שלום עולם\nconst total = 2;";
  const html = renderToStaticMarkup(createElement("div", { dir: "rtl" },
    "הנה דוגמה",
    createElement(PomeloCodeBlock, { model: codeBlockModel({ text }), onCopy() {}, onShowAll() {} }),
  ));

  assert.match(html, /^<div dir="rtl">הנה דוגמה<figure\b[^>]*\bdir="ltr"/);
  assert.equal(codeText(html), text);
});

test("rendering never calls the copy or show-all callback", (t) => {
  const onCopy = t.mock.fn();
  const onShowAll = t.mock.fn();
  const model = codeBlockModel({ text: "// example\n".repeat(CODE_BLOCK_FOLD_LIMIT + 1) });

  renderToStaticMarkup(createElement(PomeloCodeBlock, { model, onCopy, onShowAll }));

  assert.equal(onCopy.mock.callCount(), 0);
  assert.equal(onShowAll.mock.callCount(), 0);
});
