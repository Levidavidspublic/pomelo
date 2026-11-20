import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloThreadMenu } from "../src/client/pomelo/PomeloThreadMenu.js";
import { threadMenu, type ThreadMenuInput, type ThreadMenuItem } from "../src/client/pomelo/thread-menu.js";

const openThread: ThreadMenuInput = {
  archived: false,
  runningLanes: 2,
  hasParent: true,
  isSubagentLane: false,
  busy: false,
};

function render(items: ThreadMenuItem[]) {
  return renderToStaticMarkup(createElement(PomeloThreadMenu, {
    items,
    onAction: () => assert.fail("Rendering should never invoke an action"),
  }));
}

function buttons(html: string) {
  return [...html.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/g)];
}

test("the menu shows each model label once and in order on a tabbable button", () => {
  const items = threadMenu(openThread);
  const html = render(items);
  assert.match(html, /role="menu"/);
  const entries = buttons(html);
  assert.equal(entries.length, items.length);
  entries.forEach(([, tag, content], index) => {
    assert.match(tag!, /role="menuitem"/);
    assert.match(tag!, /type="button"/);
    assert.doesNotMatch(tag!, /\s(?:disabled|tabindex)=|aria-disabled="true"/i);
    assert.equal(content!.replace(/<[^>]+>/g, "").trim(), items[index]!.label + (items[index]!.danger ? " Warning" : ""));
    assert.equal(html.split(items[index]!.label).length - 1, 1);
  });
});

test("busy actions stay tabbable and each points to its own visible reason", () => {
  const items = threadMenu({ ...openThread, busy: true });
  const html = render(items);
  const reasons = [...html.matchAll(/<p\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)<\/p>/g)];
  const ids = new Set<string>();
  buttons(html).forEach(([, tag], index) => {
    const item = items[index]!;
    if (item.enabled) {
      assert.doesNotMatch(tag!, /aria-disabled="true"|aria-describedby/);
      return;
    }

    assert.match(tag!, /aria-disabled="true"/);
    assert.doesNotMatch(tag!, /\s(?:disabled|tabindex)=/i);
    const id = tag!.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(id);
    ids.add(id);
    assert.deepEqual(reasons.filter(([, reasonId]) => reasonId === id).map(([, , reason]) => reason), [item.reason]);
  });
  assert.equal(ids.size, 2);
});

test("the stop action includes a visible warning", () => {
  assert.match(render(threadMenu(openThread)), /Stop 2 sub-agents <span\b[^>]*>Warning<\/span>/);
});

test("an archived thread offers bring back without put away", () => {
  const html = render(threadMenu({ ...openThread, archived: true }));
  assert.match(html, />Bring back<\/button>/);
  assert.doesNotMatch(html, /Put away/);
});

test("an empty menu renders nothing", () => {
  assert.equal(render([]), "");
});

test("a mixed Hebrew label stays whole and sets direction for its own button", () => {
  const items = threadMenu(openThread);
  items[0] = { ...items[0]!, label: "פתיחת שיחה (Pomelo)" };
  const entries = buttons(render(items));
  assert.match(entries[0]![1]!, /dir="rtl"/);
  assert.equal(entries[0]![2], items[0].label);
  assert.match(entries[1]![1]!, /dir="ltr"/);
});
