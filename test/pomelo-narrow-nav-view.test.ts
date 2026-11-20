import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NARROW_PX } from "../src/client/narrow.js";
import { PomeloNarrowNav } from "../src/client/pomelo/PomeloNarrowNav.js";
import { narrowLayout } from "../src/client/pomelo/narrow-layout.js";

type LayoutInput = Parameters<typeof narrowLayout>[0];

function navProps(overrides: Partial<LayoutInput> = {}) {
  const input: LayoutInput = {
    width: 390, view: "chat", threadOpen: true, panelOpen: "work", ...overrides,
  };
  return {
    layout: narrowLayout(input),
    availability: {
      chat: narrowLayout({ ...input, view: "chat" }).focus === "chat",
      panel: narrowLayout({ ...input, view: "panel" }).focus === "panel",
    },
    onShow: () => assert.fail("Rendering must not request a view change"),
  };
}

function render(overrides?: Partial<LayoutInput>, dir?: "ltr" | "rtl") {
  return renderToStaticMarkup(createElement(PomeloNarrowNav, { ...navProps(overrides), dir }));
}

function buttons(html: string): string[] {
  return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

test("a wide layout renders no navigation", () => {
  assert.equal(render({ width: NARROW_PX + 1 }), "");
});

test("a narrow layout renders a named navigation landmark and three plain buttons", () => {
  const html = render();
  assert.match(html, /<nav\b[^>]*\baria-label="[^"]+"/);
  const controls = buttons(html);
  const labels = ["Threads", "Chat", "Panel"];
  assert.equal(controls.length, labels.length);
  for (const [index, button] of controls.entries()) {
    assert.match(button, /\btype="button"/);
    assert.ok(button.endsWith(`>${labels[index]}</button>`));
  }
});

test("the showing view alone is current and is named in the status text", () => {
  const views = [["rail", "Threads"], ["chat", "Chat"], ["panel", "Panel"]] as const;
  for (const [index, [view, label]] of views.entries()) {
    const html = render({ view });
    const controls = buttons(html);
    assert.equal(controls.findIndex((button) => button.includes('aria-current="page"')), index);
    assert.equal((html.match(/\baria-current=/g) ?? []).length, 1);
    assert.match(html, new RegExp(`<span\\b[^>]*role="status"[^>]*>Showing ${label}<`));
  }
});

test("the chat button says Back to chat whenever chat is hidden", () => {
  for (const view of ["rail", "panel"] as const) {
    assert.match(buttons(render({ view }))[1], />Back to chat<\/button>/);
  }
  assert.doesNotMatch(render(), /Back to chat/);
});

test("unavailable views have disabled buttons with the reason in title and hidden text", () => {
  const noThread = buttons(render({ view: "panel", threadOpen: false }));
  assert.match(noThread[0], /aria-current="page"/);
  assert.match(noThread[1], />Back to chat<span/);
  for (const button of noThread.slice(1)) {
    assert.match(button, /\sdisabled=""/);
    assert.match(button, /\btitle="Open a thread first\."/);
    assert.match(button, /<span class="sr-only"> Open a thread first\.<\/span>/);
  }

  const noPanel = buttons(render({ view: "panel", panelOpen: null }));
  assert.match(noPanel[1], /aria-current="page"/);
  assert.doesNotMatch(noPanel[1], /\sdisabled=/);
  assert.match(noPanel[2], /\sdisabled=""/);
  assert.match(noPanel[2], /\btitle="No side panel is open\."/);
  assert.match(noPanel[2], /<span class="sr-only"> No side panel is open\.<\/span>/);

  for (const button of buttons(render({ view: "rail" }))) {
    assert.doesNotMatch(button, /\s(?:disabled|title)=/);
  }
});

test("enabled buttons request their views and disabled buttons have no click handler", () => {
  const requests: LayoutInput["view"][] = [];
  const onShow = (view: LayoutInput["view"]) => requests.push(view);
  const enabled = PomeloNarrowNav({ ...navProps({ view: "rail" }), onShow });
  const disabled = PomeloNarrowNav({ ...navProps({ threadOpen: false }), onShow });
  assert.ok(enabled);
  assert.ok(disabled);

  type ButtonProps = Pick<ComponentProps<"button">, "onClick">;
  const buttonElements = (children: ReactNode) => Children.toArray(children).filter(
    (child): child is ReactElement<ButtonProps> => isValidElement<ButtonProps>(child) && child.type === "button",
  );
  for (const button of buttonElements(enabled.props.children)) {
    assert.ok(button.props.onClick);
    Reflect.apply(button.props.onClick, undefined, []);
  }
  assert.deepEqual(requests, ["rail", "chat", "panel"]);

  const disabledButtons = buttonElements(disabled.props.children).slice(1);
  assert.equal(disabledButtons.length, 2);
  for (const button of disabledButtons) {
    assert.equal(button.props.onClick, undefined);
  }
});

test("passes through RTL without adding autofocus, positive tab order or looping motion", () => {
  const html = render({ view: "panel" }, "rtl");
  assert.match(html, /<nav\b[^>]*\bdir="rtl"/);
  assert.doesNotMatch(html, /\sautofocus\b|\stabindex="\+?0*[1-9]\d*"|\banimate-/i);
});
