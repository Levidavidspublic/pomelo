import { container, propsOf, type FakeElement } from "./fake-dom.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyStatusLabel, PomeloCopyMessage } from "../src/client/pomelo/PomeloCopyMessage.js";
import { copyTextFor, type CopyPart } from "../src/client/pomelo/message-copy.js";

type Props = ComponentProps<typeof PomeloCopyMessage>;

const reply = [
  { kind: "text", markdown: "# **סיכום**\n\n```ts\nconst total = 2;\n```" },
  { kind: "card", cardKind: "chart", title: "סיכום\nTotals", note: "Chart data stays in the card" },
] as const satisfies readonly CopyPart[];

async function mount(t: TestContext, props: Props) {
  const { createRoot } = await import("react-dom/client");
  const element = container();
  const prototype: Pick<FakeElement, "focus"> = Object.getPrototypeOf(element);
  const focus = t.mock.method(prototype, "focus");
  const root = createRoot(element as never);
  t.after(async () => {
    await act(async () => root.unmount());
    element.parentNode?.removeChild(element);
  });

  await act(async () => root.render(createElement(PomeloCopyMessage, props)));
  const button = element.all().find((node) => node.tagName === "BUTTON");
  const status = element.all().find((node) => node.getAttribute("role") === "status");
  assert.ok(button);
  assert.ok(status);

  const press = () => {
    const { onClick } = propsOf(button);
    assert.ok(typeof onClick === "function");
    return onClick();
  };

  return { button, status, press, focus };
}

test("renders one native Copy button and a polite status region in a right-to-left reply", (t) => {
  const writeText = t.mock.fn(async () => {});
  const html = renderToStaticMarkup(createElement(PomeloCopyMessage, { reply, writeText, dir: "rtl" }));

  assert.match(html, /^<[^>]+\bdir="rtl"/);
  assert.equal(html.match(/<button\b/g)?.length, 1);
  assert.match(html, /<button\b[^>]*\btype="button"[^>]*>Copy<\/button>/);
  assert.match(html, /<([a-z]+)\b(?=[^>]*\brole="status")(?=[^>]*\baria-live="polite")[^>]*><\/\1>/);
  assert.doesNotMatch(html, /\b(?:autofocus|onfocus|tabindex|disabled)\b/i);
  assert.equal(writeText.mock.callCount(), 0);
});

test("copy status labels use plain words", () => {
  assert.equal(copyStatusLabel("reset"), "Copy");
  assert.equal(copyStatusLabel("success"), "Copied");
  assert.equal(copyStatusLabel("failure"), "Could not copy");
});

test("copies the model's exact plain text for code and a chart without moving focus", async (t) => {
  const writeText = t.mock.fn(async (_text: string) => {});
  const { button, status, press, focus } = await mount(t, { reply, writeText, dir: "rtl" });

  await act(async () => { await press(); });

  assert.deepEqual(writeText.mock.calls.map((call) => call.arguments), [[copyTextFor(reply, "plain").text]]);
  assert.equal(button.textContent, "Copied");
  assert.equal(status.textContent, "Copied");
  assert.equal(focus.mock.callCount(), 0);
});

test("an unsuccessful clipboard write shows and announces Could not copy", async (t) => {
  const writeText = t.mock.fn(async () => { throw new Error("Clipboard unavailable"); });
  const { button, status, press } = await mount(t, { reply, writeText });

  await act(async () => { await press(); });

  assert.equal(writeText.mock.callCount(), 1);
  assert.equal(button.textContent, "Could not copy");
  assert.equal(status.textContent, "Could not copy");
});

test("an empty reply shows Could not copy without writing to the clipboard", async (t) => {
  const writeText = t.mock.fn(async () => {});
  const { button, status, press } = await mount(t, { reply: [], writeText });

  await act(async () => { await press(); });

  assert.equal(writeText.mock.callCount(), 0);
  assert.equal(button.textContent, "Could not copy");
  assert.equal(status.textContent, "Could not copy");
});

test("ignores a second press while the write is pending and allows another after it settles", async (t) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const writeText = t.mock.fn(() => pending);
  const { button, status, press } = await mount(t, { reply, writeText });

  await act(async () => {
    void press();
    void press();
  });

  assert.equal(writeText.mock.callCount(), 1);
  assert.equal(button.textContent, "Copy");
  assert.equal(status.textContent, "");
  assert.equal(button.hasAttribute("disabled"), false);

  await act(async () => { finish(); });
  assert.equal(button.textContent, "Copied");
  assert.equal(status.textContent, "Copied");

  await act(async () => { await press(); });
  assert.equal(writeText.mock.callCount(), 2);
});
