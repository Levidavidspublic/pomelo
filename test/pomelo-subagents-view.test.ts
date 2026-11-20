import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloSubagents } from "../src/client/pomelo/PomeloSubagents.js";
import type { LaneLike } from "../src/client/pomelo/subagent-rows.js";

function lane(laneId: string, fields: Partial<LaneLike> = {}): LaneLike {
  return {
    threadId: "thread-a",
    laneId,
    purpose: "Review the outline",
    spawnedBy: "parent-agent",
    status: "running",
    createdAt: 10,
    ...fields,
  };
}

function render(lanes: readonly LaneLike[]) {
  return renderToStaticMarkup(createElement(PomeloSubagents, { lanes, threadId: "thread-a" }));
}

test("renders a named list for the thread with active rows first and one tally above it", () => {
  const html = render([
    lane("finished", { purpose: "Draft the outline", status: "done", createdAt: 20 }),
    lane("other", { threadId: "thread-b", purpose: "Other thread purpose" }),
    lane("working"),
  ]);

  assert.match(html, /<ol\b[^>]*\baria-label="Sub-agents"/);
  assert.equal(html.match(/1 working, 1 back/g)?.length, 1);
  assert.match(html, />1 working, 1 back<.*<ol\b/);
  assert.doesNotMatch(html, /Other thread purpose/);

  const rows = html.match(/<li\b.*?<\/li>/g) ?? [];
  assert.equal(rows.length, 2);
  assert.match(rows[0], />Review the outline</);
  assert.match(rows[0], />parent-agent</);
  assert.match(rows[0], /class="ring-spin" aria-hidden="true"/);
  assert.match(rows[0], /class="sr-only">working</);
  assert.match(rows[1], />Draft the outline</);
  assert.match(rows[1], /class="sr-only">done</);
  assert.doesNotMatch(html, /data-tone="bad"/);
});

test("a failed lane has a bad tone and a readable mark state", () => {
  const html = render([lane("failed", { status: "failed" })]);

  assert.match(html, /<li\b[^>]*\bdata-tone="bad"/);
  assert.match(html, />1 failed</);
  assert.match(html, /class="sr-only">blocked</);
});

test("keeps a Hebrew purpose whole with automatic row direction", () => {
  const html = render([lane("hebrew", { purpose: "סקירת הטיוטה" })]);

  assert.match(html, /<li\b[^>]*\bdir="auto"/);
  assert.match(html, />סקירת הטיוטה</);
});

test("escapes markup in a purpose", () => {
  const html = render([lane("markup", { purpose: "Review <img onerror>" })]);

  assert.match(html, />Review &lt;img onerror&gt;</);
  assert.doesNotMatch(html, /<img\b/);
});

test("renders nothing when the thread has no lanes", () => {
  assert.equal(render([]), "");
  assert.equal(render([lane("other", { threadId: "thread-b" })]), "");
});
