import { container, propsOf, type FakeElement } from "./fake-dom.js";
import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloHomeRecents, type PomeloHomeRecentsProps } from "../src/client/pomelo/PomeloHomeRecents.js";
import { timeLabel } from "../src/client/pomelo/rail-row.js";
import type { RecentSession } from "../src/client/storage.js";

const now = new Date(2026, 0, 14, 12).getTime();
const minutesAgo = (minutes: number) => now - minutes * 60_000;

const thread = (sid: string, title: string, openedAt: number): RecentSession => ({
  sid, title, openedAt, invite: "", role: "owner",
});

const rows = Object.freeze([
  thread("older", "Release notes", minutesAgo(1)),
  thread("newest", "תכנון שבועי", minutesAgo(90)),
  thread("legacy", "Draft outline", minutesAgo(12)),
]);
const meta = {
  newest: { lastActivityAt: minutesAgo(3), projectTags: ["design", "docs"], openedBy: "researcher" },
  older: { lastActivityAt: minutesAgo(30), openedBy: "person" },
};

function render(overrides: Partial<PomeloHomeRecentsProps> = {}) {
  return renderToStaticMarkup(createElement(PomeloHomeRecents, {
    rows, meta, now, tagLabels: { design: "עיצוב", docs: "Documentation" }, onOpen: () => {}, ...overrides,
  }));
}

const buttons = (html: string) => html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];

test("recent threads render in latest-activity order with their own title direction and time", () => {
  const html = render();
  assert.match(html, /^<ul\b[^>]*aria-label="Recent threads"/);
  const visible = buttons(html);
  assert.equal(visible.length, 3);
  assert.match(visible[0], /dir="rtl"[^>]*>תכנון שבועי</);
  assert.match(visible[1], /dir="ltr"[^>]*>Draft outline</);
  assert.match(visible[2], /dir="ltr"[^>]*>Release notes</);

  const activity = [meta.newest.lastActivityAt, rows[2].openedAt, meta.older.lastActivityAt];
  for (const [index, button] of visible.entries()) {
    assert.match(button, /^<button\b[^>]*\btype="button"/);
    assert.ok(button.includes(`>${timeLabel(activity[index], now)}<`));
  }
  assert.match(html, /dir="rtl"[^>]*>עיצוב</);
  assert.match(html, /dir="ltr"[^>]*>Documentation</);
  assert.match(visible[0], />opened by an agent</);
  assert.doesNotMatch(visible[1] + visible[2], /opened by an agent/);
  assert.doesNotMatch(html, /\b(?:autofocus|tabindex|disabled)\b|animate-/i);
});

test("empty recents show one plain line without a list or button", () => {
  for (const html of [render({ rows: [] }), render({ limit: 0 })]) {
    assert.match(html, /^<p\b[^>]*>No threads yet<\/p>$/);
  }
});

test("recents use the model's default and custom limits", () => {
  const moreRows = Array.from({ length: 7 }, (_, i) => thread(`row-${i}`, `Thread ${i}`, minutesAgo(i)));
  assert.equal(buttons(render({ rows: moreRows })).length, 5);

  const html = render({ rows: moreRows, limit: 2 });
  assert.equal(buttons(html).length, 2);
  assert.match(html, />Thread 0</);
  assert.match(html, />Thread 1</);
  assert.doesNotMatch(html, />Thread 2</);
});

test("each button is named by its title and a press opens its thread once without moving focus", async (t) => {
  const { createRoot } = await import("react-dom/client");
  const element = container();
  const prototype: Pick<FakeElement, "focus"> = Object.getPrototypeOf(element);
  const focus = t.mock.method(prototype, "focus");
  const root = createRoot(element as never);
  t.after(async () => {
    await act(async () => root.unmount());
    element.parentNode?.removeChild(element);
  });

  const open = t.mock.fn((_sid: string) => {});
  await act(async () => root.render(createElement(PomeloHomeRecents, { rows, meta, now, onOpen: open })));

  const nodes = element.all();
  const rowButtons = nodes.filter((node) => node.tagName === "BUTTON");
  assert.deepEqual(rowButtons.map((button) => {
    const name = button.getAttribute("aria-labelledby");
    assert.ok(name);
    return button.all().find((node) => node.getAttribute("id") === name)?.textContent;
  }), [rows[1].title, rows[2].title, rows[0].title]);

  const description = rowButtons[0].getAttribute("aria-describedby");
  assert.ok(description);
  const details = description.split(" ").map((id) => nodes.find((node) => node.getAttribute("id") === id));
  assert.equal(details[0]?.textContent, timeLabel(meta.newest.lastActivityAt, now));
  assert.equal(details[1]?.textContent, "opened by an agent");
  assert.deepEqual(details[2]?.all().filter((node) => node.tagName === "LI").map((node) => node.textContent), ["design", "docs"]);

  assert.equal(open.mock.callCount(), 0);
  const { onClick } = propsOf(rowButtons[1]);
  assert.ok(typeof onClick === "function");
  await act(async () => { onClick(); });
  assert.deepEqual(open.mock.calls.map((call) => call.arguments), [[rows[2].sid]]);
  assert.equal(focus.mock.callCount(), 0);
});
