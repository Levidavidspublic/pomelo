import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloThreadNotice } from "../src/client/pomelo/PomeloThreadNotice.js";
import { makeThreadLink } from "../src/client/pomelo/thread-link.js";
import { addThreadNotice, noticesFor } from "../src/client/pomelo/thread-notice-model.js";

const empty = { notices: [], seen: [] };
const opened = {
  type: "thread_opened",
  sid: "draft",
  parentThreadId: "planning",
  title: "Draft release notes",
  openedBy: "Researcher",
  lastActivityAt: 20,
};
const hebrewTitle = "תכנון הפרויקט (Pomelo)";
const first = addThreadNotice(empty, opened);
const both = addThreadNotice(first, {
  ...opened, sid: "plan", title: hebrewTitle, openedBy: "מתכנן", lastActivityAt: 10,
});

const render = (notices = noticesFor(both, "planning")) => renderToStaticMarkup(
  createElement(PomeloThreadNotice, { notices, onOpen: () => {}, onDismiss: () => {} }),
);

test("notices show who opened each thread and link its title in model order", () => {
  const rows = render().match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
  assert.equal(rows.length, 2);
  assert.match(rows[0], />Researcher</);
  assert.match(rows[0], /opened a thread/);
  assert.match(rows[0], />Draft release notes</);
  assert.ok(rows[0].includes(`href="${makeThreadLink({ threadId: "draft" })}"`));
  assert.match(rows[1], />מתכנן</);
  assert.ok(rows[1].includes(hebrewTitle));
  assert.ok(rows[1].includes(`href="${makeThreadLink({ threadId: "plan" })}"`));
  assert.match(rows[0], /<a\b[^>]*href=/);
  assert.match(rows[1], /<a\b[^>]*href=/);
});

test("notices use a polite live region without requesting focus", () => {
  const html = render();
  const wrapper = html.match(/^<[^>]+>/)?.[0] ?? "";
  assert.match(wrapper, /\brole="status"/);
  assert.match(wrapper, /\baria-live="polite"/);
  assert.doesNotMatch(html, /\bautofocus\b|\btabindex="\+?0*[1-9]\d*"/i);
});

test("Hebrew titles read right to left and dismiss buttons identify their threads", () => {
  const html = render();
  assert.match(html, /<bdi\b[^>]*dir="rtl"[^>]*>תכנון הפרויקט \(Pomelo\)<\/bdi>/);
  assert.match(html, /<button\b[^>]*aria-label="Dismiss Draft release notes"[^>]*>Dismiss<\/button>/);
  assert.match(html, /<button\b[^>]*aria-label="Dismiss תכנון הפרויקט \(Pomelo\)"[^>]*>Dismiss<\/button>/);
});

test("no notices render empty markup", () => {
  assert.equal(render(noticesFor(both, "another-thread")), "");
});

test("notice titles with HTML are escaped in text and labels", () => {
  const state = addThreadNotice(empty, { ...opened, title: "<img onerror>" });
  const html = render(noticesFor(state, "planning"));
  assert.match(html, />&lt;img onerror&gt;</);
  assert.match(html, /aria-label="Dismiss &lt;img onerror&gt;"/);
  assert.doesNotMatch(html, /<img\b/);
});

test("a notice with an unlinkable id stays dismissible and does not hide other notices", () => {
  const state = addThreadNotice(first, { ...opened, sid: "invalid id", title: "Another draft" });
  const html = render(noticesFor(state, "planning"));
  assert.equal(html.match(/<a\b/g)?.length, 1);
  assert.ok(html.includes(`href="${makeThreadLink({ threadId: "draft" })}"`));
  assert.match(html, />Another draft</);
  assert.match(html, /<button\b[^>]*aria-label="Dismiss Another draft"/);
});
