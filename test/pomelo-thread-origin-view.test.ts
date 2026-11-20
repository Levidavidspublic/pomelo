import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloThreadOrigin } from "../src/client/pomelo/PomeloThreadOrigin.js";
import { makeThreadLink } from "../src/client/pomelo/thread-link.js";
import { threadOrigin, type ThreadOriginResult } from "../src/client/pomelo/thread-origin.js";

const parent = { sid: "parent", title: "Project planning" };
const child = { sid: "child", title: "Research", openedBy: "Researcher", parentThreadId: parent.sid };
const threadsById = new Map([[parent.sid, parent]]);

function render(origin: ThreadOriginResult) {
  return renderToStaticMarkup(createElement(PomeloThreadOrigin, {
    origin,
    onOpenParent: () => assert.fail("Rendering should never open the parent thread"),
  }));
}

test("a thread Amit opened renders nothing even with parent metadata", () => {
  assert.equal(render(threadOrigin({ ...child, openedBy: "amit" }, threadsById)), "");
});

test("an agent-opened thread shows the opener and a named link to its parent", () => {
  const html = render(threadOrigin(child, threadsById));

  assert.match(html, /aria-label="Thread origin"/);
  assert.match(html, />Opened by Researcher, from /);
  const link = html.match(/<a\b[^>]*\bhref="([^"]+)"[^>]*>(.*?)<\/a>/);
  assert.ok(link);
  assert.equal(link[1], makeThreadLink({ threadId: parent.sid }));
  assert.match(link[2], />Project planning</);
  assert.doesNotMatch(html, /\sautofocus\b/i);
  for (const [, tabIndex] of html.matchAll(/\stabindex="([^"]*)"/gi)) {
    assert.ok(Number(tabIndex) <= 0, `Unexpected tabindex ${tabIndex}`);
  }
});

test("a missing parent or loop shows the model's note without a link", () => {
  const missingParent = threadOrigin(child, new Map());
  const missingAncestor = threadOrigin(child, new Map([[parent.sid, { ...parent, parentThreadId: "missing" }]]));
  const loop = threadOrigin(child, new Map([[parent.sid, { ...parent, parentThreadId: child.sid }]]));

  for (const origin of [missingParent, missingAncestor, loop]) {
    const html = render(origin);
    assert.ok(origin.note);
    assert.ok(html.includes(origin.note));
    assert.match(html, />Opened by Researcher/);
    assert.doesNotMatch(html, /<a\b/);
  }
});

test("an agent-opened thread without parent metadata still shows the opener", () => {
  const html = render(threadOrigin({ ...child, parentThreadId: undefined }, threadsById));
  assert.match(html, />Opened by Researcher</);
  assert.doesNotMatch(html, /<a\b/);
});

test("a Hebrew parent title has its own right-to-left direction", () => {
  const title = "תכנון הפרויקט";
  const html = render(threadOrigin(child, new Map([[parent.sid, { ...parent, title }]])));
  assert.match(html, /<(bdi|span|a)\b[^>]*\bdir="rtl"[^>]*>תכנון הפרויקט<\/\1>/);
});

test("opener markup is escaped", () => {
  const html = render(threadOrigin({ ...child, openedBy: "Research <em>& Review</em>" }, threadsById));
  assert.match(html, /Opened by Research &lt;em&gt;&amp; Review&lt;\/em&gt;/);
  assert.doesNotMatch(html, /<\/?em\b/);
});
