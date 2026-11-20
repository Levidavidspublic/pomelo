import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetCardView } from "../src/client/pomelo/WidgetCardView.js";
import { startWidget, widgetStep, type WidgetState } from "../src/client/pomelo/widget-state.js";

const cardId = "card-1";
const selectWidget = { type: "select" as const, label: "Which format?", options: ["List", "Table"] };
const open = startWidget(cardId);
const picked = widgetStep(open, { type: "pick", cardId, pick: { value: "Table", label: "Table format" } });
const sending = widgetStep(picked, { type: "send", cardId });

function render(state: WidgetState, widget: ComponentProps<typeof WidgetCardView>["widget"] = selectWidget) {
  return renderToStaticMarkup(createElement(WidgetCardView, {
    widget,
    state,
    onPick: () => assert.fail("Rendering should never pick an answer"),
    onSend: () => assert.fail("Rendering should never send an answer"),
  }));
}

test("an open card shows its question and choices and enables Send after a pick", () => {
  const html = render(open);
  assert.match(html, />Which format\?</);
  assert.match(html, />Open</);
  assert.doesNotMatch(html, /aria-busy="true"/);
  assert.equal([...html.matchAll(/<button\b/g)].length, selectWidget.options.length + 1);
  assert.equal([...html.matchAll(/<button\b[^>]*type="button"/g)].length, selectWidget.options.length + 1);
  assert.match(html, /<button\b[^>]*aria-pressed="false"[^>]*>List<\/button>/);
  assert.match(html, /<button\b[^>]*aria-pressed="false"[^>]*>Table<\/button>/);
  assert.doesNotMatch(html, /<button\b[^>]*\sdisabled=[^>]*>(?:List|Table)<\/button>/);
  assert.match(html, /<button\b[^>]*\sdisabled=""[^>]*>Send<\/button>/);

  const withPick = render(picked);
  assert.match(withPick, /<button\b[^>]*aria-pressed="true"[^>]*>Table<\/button>/);
  assert.match(withPick, /<button\b[^>]*aria-pressed="false"[^>]*>List<\/button>/);
  const sendButton = withPick.match(/<button\b[^>]*>Send<\/button>/)?.[0];
  assert.ok(sendButton);
  assert.doesNotMatch(sendButton, /\sdisabled=/);
});

test("a sending card is busy and disables every choice and Send", () => {
  const html = render(sending);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, />Sending</);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)];
  assert.equal(buttons.length, selectWidget.options.length + 1);
  for (const [button] of buttons) assert.match(button, /\sdisabled=""/);
});

test("an answered card displays the model's picked label as text without controls", () => {
  const html = render(widgetStep(sending, { type: "accepted", cardId }));
  assert.match(html, />Answered</);
  assert.match(html, />Table format</);
  assert.doesNotMatch(html, /<(?:button|input)\b/);
});

test("a closed card displays Closed without controls", () => {
  const html = render(widgetStep(picked, { type: "expired", cardId }));
  assert.match(html, />Closed</);
  assert.doesNotMatch(html, /<(?:button|input)\b/);
});

test("a refusal displays the reason in a status region and keeps the card open", () => {
  const refused = widgetStep(sending, { type: "refused", cardId, reason: "Choose an available format." });
  const html = render(refused);
  assert.match(html, />Open</);
  assert.match(html, /<\w+\b[^>]*role="status"[^>]*>Choose an available format\.</);
  assert.match(html, /<button\b[^>]*aria-pressed="true"[^>]*>Table<\/button>/);
});

test("the title sets the direction for Hebrew and English cards", () => {
  const hebrew = render(open, { ...selectWidget, label: "איזה פורמט?", options: ["רשימה", "טבלה"] });
  assert.match(hebrew, /^<[^>]*dir="rtl"/);
  assert.match(hebrew, />איזה פורמט\?</);
  assert.match(hebrew, />טבלה</);
  assert.match(render(open), /^<[^>]*dir="ltr"/);
});

test("title and choice markup is escaped and no inline handlers are emitted", () => {
  const html = render(open, {
    ...selectWidget,
    label: "<script>question</script>",
    options: ["<script>choice</script>", "Table"],
  });
  assert.match(html, />&lt;script&gt;question&lt;\/script&gt;</);
  assert.match(html, />&lt;script&gt;choice&lt;\/script&gt;</);
  assert.doesNotMatch(html, /<\/?script\b|\son[a-z]+\s*=|dangerouslySetInnerHTML/i);
});

test("a toggle displays both choices and marks a false pick as No", () => {
  const no = widgetStep(open, { type: "pick", cardId, pick: { value: false } });
  const html = render(no, { type: "toggle", label: "Show details?" });
  assert.match(html, /<button\b[^>]*aria-pressed="true"[^>]*>No<\/button>/);
  assert.match(html, /<button\b[^>]*aria-pressed="false"[^>]*>Yes<\/button>/);
  assert.doesNotMatch(html, /<button\b[^>]*\sdisabled=[^>]*>Send<\/button>/);
});

test("text and number widgets display the controlled answer and disable it while sending", () => {
  for (const [type, value] of [["text", "Garden"], ["number", 0]] as const) {
    const widget = { type, label: "Your answer" };
    const entry = widgetStep(open, { type: "pick", cardId, pick: { value } });
    const html = render(entry, widget);
    assert.match(html, new RegExp(`<input\\b[^>]*type="${type}"[^>]*>`));
    assert.match(html, new RegExp(`<input\\b[^>]*value="${value}"[^>]*>`));
    assert.doesNotMatch(html, /<input\b[^>]*\sdisabled=/);
    assert.match(render(widgetStep(entry, { type: "send", cardId }), widget), /<input\b[^>]*\sdisabled=""/);
  }
});
