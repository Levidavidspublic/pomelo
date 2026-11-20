import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloNewMessagesPill } from "../src/client/pomelo/PomeloNewMessagesPill.js";
import { chatFollowReduce, chatFollowView, initialChatFollow } from "../src/client/pomelo/chat-follow.js";

const arrival = { type: "arrived", mine: false } as const;
const following = chatFollowReduce(initialChatFollow(), arrival);
const scrolledUp = chatFollowReduce(following, {
  type: "scrolled",
  scrollTop: 451,
  scrollHeight: 1000,
  clientHeight: 500,
});
const unseen = chatFollowReduce(chatFollowReduce(scrolledUp, arrival), arrival);

test("the pill renders nothing while following or while there are no unseen messages", () => {
  for (const state of [following, scrolledUp, chatFollowReduce(unseen, { type: "jumpToLatest" })]) {
    assert.equal(renderToStaticMarkup(createElement(PomeloNewMessagesPill, { state })), "");
  }
});

test("unseen messages render one button with the model label inside a polite status region", () => {
  const html = renderToStaticMarkup(createElement(PomeloNewMessagesPill, { state: unseen }));
  const wrapper = html.match(/^<div\b[^>]*>/)?.[0] ?? "";
  assert.match(wrapper, /\brole="status"/);
  assert.match(wrapper, /\baria-live="polite"/);
  assert.match(wrapper, /\bdir="ltr"/);
  assert.equal(html.match(/<button\b/g)?.length, 1);
  assert.match(html, /<button\b[^>]*type="button"[^>]*>/);
  assert.ok(html.includes(`>${chatFollowView(unseen).pillLabel}</button></div>`));
  assert.doesNotMatch(html, /\bautofocus\b|\banimation\b|\banimate-/i);
});

test("the status region follows the requested right-to-left direction", () => {
  const html = renderToStaticMarkup(createElement(PomeloNewMessagesPill, { state: unseen, dir: "rtl" }));
  assert.match(html, /^<div\b[^>]*dir="rtl"/);
  assert.match(html, /<button\b[^>]*dir="auto"/);
  assert.ok(html.includes(`>${chatFollowView(unseen).pillLabel}</button>`));
});
