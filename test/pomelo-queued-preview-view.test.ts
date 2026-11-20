import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloQueuedPreview } from "../src/client/pomelo/PomeloQueuedPreview.js";
import { addQueued, previewRows, type QueuedMessage, type QueuedPreviewState } from "../src/client/pomelo/queued-preview.js";

const threadId = "thread-1";
const emptyQueue: QueuedPreviewState = { queues: {} };
const messages: readonly QueuedMessage[] = [
  { id: "message-c", text: "Check the draft" },
  { id: "message-a", text: "בדוק את הטיוטה", attachments: ["diagram.png", "notes.txt"] },
  { id: "message-b", text: "Review the next section. ".repeat(5), attachments: ["outline.txt"] },
];

function queuedRows() {
  let state = emptyQueue;
  for (const message of messages) {
    const result = addQueued(state, threadId, message);
    assert.ok(result.ok);
    state = result.state;
  }
  return previewRows(state, threadId);
}

function render(rows: ReturnType<typeof previewRows>) {
  return renderToStaticMarkup(createElement(PomeloQueuedPreview, { rows, onEdit: () => {}, onRemove: () => {} }));
}

test("an empty queue renders nothing", () => {
  assert.equal(render(previewRows(emptyQueue, threadId)), "");
});

test("queued previews keep their order, clipped text, and individual directions", () => {
  const rows = queuedRows();
  const html = render(rows);
  assert.match(html, /^<ul\b[^>]*>.*<\/ul>$/);

  const items = [...html.matchAll(/<li\b[^>]*>(.*?)<\/li>/g)].map(([, item]) => item);
  assert.equal(items.length, 3);
  assert.match(items[0], /<bdi\b[^>]*\bdir="ltr"[^>]*>Check the draft<\/bdi>/);
  assert.match(items[1], /<bdi\b[^>]*\bdir="rtl"[^>]*>בדוק את הטיוטה<\/bdi>/);
  assert.equal(items[2].match(/<bdi\b[^>]*\bdir="ltr"[^>]*>(.*?)<\/bdi>/)?.[1], rows[2].text);
  assert.ok(rows[2].text.endsWith("…"));

  assert.doesNotMatch(items[0], /\battachments?\b/);
  assert.match(items[1], />2 attachments</);
  assert.match(items[2], />1 attachment</);

  for (const [index, item] of items.entries()) {
    const buttons = [...item.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)];
    assert.equal(buttons.length, 2);
    for (const [buttonIndex, action] of ["Edit", "Remove"].entries()) {
      const [, attributes, text] = buttons[buttonIndex];
      assert.match(attributes, /\btype="button"/);
      assert.ok(attributes.includes(`aria-label="${action} ${rows[index].label}"`));
      assert.doesNotMatch(attributes, /\bdisabled\b|\btabindex\b/i);
      assert.equal(text, action);
    }
  }

  assert.doesNotMatch(html, /\bautofocus\b|\banimate-/i);
  for (const [, tabIndex] of html.matchAll(/\btabindex="([^"]*)"/gi)) {
    assert.ok(Number(tabIndex) <= 0);
  }
});

function clickButtons(node: ReactNode) {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) continue;
    if (child.type === "button") {
      assert.equal(typeof child.props.onClick, "function");
      child.props.onClick?.();
    } else {
      clickButtons(child.props.children);
    }
  }
}

test("each button calls its action with the queue item's id", () => {
  const edited: string[] = [];
  const removed: string[] = [];
  const view = PomeloQueuedPreview({
    rows: queuedRows(),
    onEdit: (id) => { edited.push(id); },
    onRemove: (id) => { removed.push(id); },
  });

  assert.deepEqual(edited, []);
  assert.deepEqual(removed, []);
  clickButtons(view);
  assert.deepEqual(edited, messages.map(({ id }) => id));
  assert.deepEqual(removed, messages.map(({ id }) => id));
});
