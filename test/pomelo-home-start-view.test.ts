import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { homeStartKeyAction, PomeloHomeStart } from "../src/client/pomelo/PomeloHomeStart.js";
import type { ProjectChip } from "../src/client/pomelo/home-chips.js";
import { homeStartReducer, initialHomeStart, type HomeStartState } from "../src/client/pomelo/home-start.js";

const chips: readonly ProjectChip[] = [
  { slug: "planning", label: "Planning", count: 2, lastActivityAt: 20 },
  { slug: "design", label: "עיצוב (Design)", count: 1, lastActivityAt: 10 },
];
const draft = homeStartReducer(initialHomeStart(), { type: "type", text: "Review the plan." });
const opening = homeStartReducer(draft, { type: "send" });

function render(state: HomeStartState, dir: "ltr" | "rtl" = "ltr", projects = chips) {
  return renderToStaticMarkup(createElement(PomeloHomeStart, {
    chips: projects,
    state,
    dir,
    dispatch: () => assert.fail("Rendering should never dispatch an event"),
  }));
}

function sendButton(html: string) {
  const button = html.match(/<button\b[^>]*>(?=Send<\/button>)/)?.[0];
  assert.ok(button);
  return button;
}

function sendDescription(html: string) {
  const id = sendButton(html).match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(id);
  const descriptions = [...html.matchAll(/<p\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)<\/p>/g)];
  return descriptions.find(([, descriptionId]) => descriptionId === id)?.[2];
}

test("the multiline message box has an associated label and does not take focus", () => {
  const html = render(initialHomeStart());
  const labelTarget = html.match(/<label\b[^>]*\bfor="([^"]+)"[^>]*>Message<\/label>/)?.[1];
  assert.ok(labelTarget);
  assert.equal(html.match(/<textarea\b[^>]*\bid="([^"]+)"/)?.[1], labelTarget);
  assert.doesNotMatch(html, /\bautofocus\b|type="password"|href="[^"]*claude\.ai/i);
});

test("project chips are native toggle buttons in model order with spoken selection labels", () => {
  const state = homeStartReducer(draft, { type: "pickChip", slug: "design" });
  const html = render(state);
  assert.match(html, /role="group"[^>]*aria-label="Projects"/);
  const buttons = [...html.matchAll(/(<button\b[^>]*aria-pressed="(true|false)"[^>]*>)(.*?)<\/button>/g)];
  assert.equal(buttons.length, chips.length);
  buttons.forEach(([, tag, pressed, content], index) => {
    const chip = chips[index]!;
    const picked = chip.slug === state.projectTag;
    assert.equal(pressed, String(picked));
    assert.match(tag!, /type="button"/);
    assert.doesNotMatch(tag!, /\s(?:disabled|tabindex)=/i);
    const labelId = tag!.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(labelId);
    assert.deepEqual(content!.match(/<bdi id="([^"]+)">([^<]*)<\/bdi>/)?.slice(1), [labelId, chip.label]);
    const descriptionId = tag!.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(descriptionId);
    assert.deepEqual(
      [...content!.matchAll(/<span\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)<\/span>/g)]
        .map(([, id, words]) => [id, words]),
      [[descriptionId, picked ? "picked" : "not picked"]],
    );
  });
});

test("Send explains why it is disabled for empty and whitespace-only drafts", () => {
  for (const state of [initialHomeStart(), homeStartReducer(draft, { type: "type", text: " \t\n" })]) {
    const html = render(state);
    assert.match(sendButton(html), /\sdisabled=""/);
    assert.equal(sendDescription(html), "Write a message to send.");
  }
});

test("Send is enabled after typing a message", () => {
  const html = render(draft);
  assert.doesNotMatch(sendButton(html), /\sdisabled=|aria-describedby=/);
  assert.match(html, /<textarea\b[^>]*>Review the plan\.<\/textarea>/);
});

test("Send is disabled while opening and one plain status line explains why", () => {
  const html = render(opening);
  assert.match(sendButton(html), /\sdisabled=""/);
  assert.equal([...html.matchAll(/role="status"/g)].length, 1);
  assert.equal([...html.matchAll(/Opening a thread\./g)].length, 1);
  assert.equal(sendDescription(html), "Opening a thread.");
  assert.doesNotMatch(html, /spinner|animate-/i);
});

test("a failed start shows the reason as text and allows a retry", () => {
  const state = homeStartReducer(opening, { type: "failed", reason: "Could not open the thread. Try again." });
  const html = render(state);
  assert.match(html, /role="alert"[^>]*>Could not open the thread\. Try again\./);
  assert.doesNotMatch(sendButton(html), /\sdisabled=/);
  assert.match(html, /<textarea\b[^>]*>Review the plan\.<\/textarea>/);
});

test("RTL reaches the wrapper and the message box without changing the draft", () => {
  const state = homeStartReducer(draft, { type: "type", text: "בדקו את Plan A.\nתודה!" });
  const html = render(state, "rtl");
  assert.match(html, /^<div\b[^>]*\bdir="rtl"/);
  assert.match(html, /<textarea\b[^>]*\bdir="rtl"[^>]*>בדקו את Plan A\.\nתודה!<\/textarea>/);
});

test("an empty chip list omits the project group", () => {
  const html = render(draft, "ltr", []);
  assert.doesNotMatch(html, /role="group"|aria-pressed=/);
  assert.ok(sendButton(html));
});

test("the message box sends on Enter and leaves Shift+Enter for a new line", () => {
  const enter = { key: "Enter", shiftKey: false, isComposing: false };
  assert.equal(homeStartKeyAction(draft, enter), "send");
  assert.equal(homeStartKeyAction(draft, { ...enter, shiftKey: true }), "new-line");
  assert.equal(homeStartKeyAction(draft, { ...enter, key: "Escape" }), null);
});

test("Enter does nothing during composition, on repeat, without a draft, or while opening", () => {
  const enter = { key: "Enter", shiftKey: false, isComposing: false };
  assert.equal(homeStartKeyAction(draft, { ...enter, isComposing: true }), null);
  assert.equal(homeStartKeyAction(draft, { ...enter, isComposing: true, shiftKey: true }), null);
  assert.equal(homeStartKeyAction(draft, { ...enter, repeat: true }), null);
  assert.equal(homeStartKeyAction(initialHomeStart(), enter), null);
  assert.equal(homeStartKeyAction(opening, enter), null);
});
