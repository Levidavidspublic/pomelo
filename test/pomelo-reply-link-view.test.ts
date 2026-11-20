import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloReplyLink } from "../src/client/pomelo/PomeloReplyLink.js";
import { replyLink } from "../src/client/pomelo/reply-link.js";
import { makeThreadLink } from "../src/client/pomelo/thread-link.js";

const appOrigin = "https://pomelo.example";

function render(link: ReturnType<typeof replyLink>) {
  const html = renderToStaticMarkup(createElement(PomeloReplyLink, { link }));
  for (const [tag] of html.matchAll(/<[a-z][^>]*>/gi)) {
    assert.doesNotMatch(tag, /(?:javascript|data):/i);
    assert.doesNotMatch(tag, /\s(?:autofocus|on[a-z]+)(?=[\s=>])/i);
  }
  return html;
}

test("an outside HTTPS link uses the model href and shows its destination host beside the link", () => {
  const link = replyLink({ href: " HTTPS://Docs.Example:8443/a b ", text: "Read the docs", appOrigin });
  assert.equal(link.mode, "link");

  const html = render(link);
  const anchors = [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/g)];
  assert.equal(anchors.length, 1);
  const [, attributes, label] = anchors[0]!;
  assert.ok(attributes?.includes(`href="${link.href}"`));
  assert.match(attributes, /\btarget="_blank"/);
  const rel = attributes.match(/\brel="([^"]*)"/)?.[1]?.split(/\s+/);
  assert.ok(rel?.includes("noopener") && rel.includes("noreferrer"));
  assert.equal(label, '<bdi dir="ltr">Read the docs</bdi>');
  assert.ok(html.split("</a>")[1]?.includes(`>${link.host}</bdi>`));
});

test("a mismatched label shows a warning in words and the actual destination", () => {
  const link = replyLink({ href: "https://docs.example/", text: "other.example", appOrigin });
  assert.equal(link.mode, "link");
  assert.equal(link.mismatch, true);

  const html = render(link);
  assert.match(html, />other\.example<\/bdi><\/a>/);
  assert.match(html, /<\/a>.*>Link text names a different site\. Destination is docs\.example</);
});

test("same-origin thread URLs and thread fragments open in the current tab", () => {
  const fragment = makeThreadLink({ threadId: "example-1" });
  for (const href of [`${appOrigin}/${fragment}`, fragment]) {
    const link = replyLink({ href, text: "Open thread", appOrigin });
    assert.equal(link.mode, "inApp");

    const html = render(link);
    const anchor = html.match(/<a\b[^>]*>/)?.[0];
    assert.ok(anchor?.includes(`href="${link.href}"`));
    assert.doesNotMatch(html, /\starget=/i);
    assert.ok(html.split("</a>")[1]?.includes(`>${link.host}</bdi>`));
  }
});

test("blocked schemes and addresses with credentials show the model reason as plain text", () => {
  for (const [href, text] of [
    ["javascript:void(0)", "javascript:void(0)"],
    ["data:text/plain,example", "data:text/plain,example"],
    ["file:///example.txt", "Local file"],
    ["https://user:pass@host.example/", "Restricted page"],
  ] as const) {
    const link = replyLink({ href, text, appOrigin });
    assert.equal(link.mode, "text");

    const html = render(link);
    assert.doesNotMatch(html, /<a\b|\shref=/i);
    const title = html.match(/^<span\b[^>]*\btitle="([^"]*)"/)?.[1];
    assert.equal(title, link.reason);
    const spokenReason = html.match(/<span class="sr-only">([^<]*)<\/span>/)?.[1];
    assert.equal(spokenReason?.trim(), link.reason);
    assert.ok(html.includes(`>${link.text}</bdi>`));
  }
});

test("Hebrew link text is isolated right to left while the host reads left to right", () => {
  const html = render(replyLink({ href: "https://docs.example/", text: "קישור לדוגמה", appOrigin }));

  assert.match(html, /<a\b[^>]*><bdi dir="rtl">קישור לדוגמה<\/bdi><\/a>/);
  assert.match(html, /<bdi\b[^>]*dir="ltr"[^>]*>docs\.example<\/bdi>/);
});

test("markup in the label is escaped and creates no HTML elements or attributes", () => {
  const text = '<img src="data:text/plain,example" onerror="example" autofocus>';
  const html = render(replyLink({ href: "https://docs.example/", text, appOrigin }));

  assert.ok(html.includes("&lt;img src=&quot;data:text/plain,example&quot; onerror=&quot;example&quot; autofocus&gt;"));
  assert.doesNotMatch(html, /<img\b/i);
});
