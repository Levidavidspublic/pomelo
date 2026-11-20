import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloWorkPanel } from "../src/client/pomelo/PomeloWorkPanel.js";
import type { LaneLike, ToolCallLike } from "../src/client/pomelo/work-panel.js";

const runningLane: LaneLike = {
  id: "research",
  name: "מחקר",
  engine: { tool: "codex", model: "model-a" },
  state: "running",
};
const doneLane: LaneLike = {
  id: "draft",
  name: "Draft",
  tool: "claude",
  model: "model-b",
  state: "done",
  lastActivityAt: 100,
};

function render(lanes: readonly LaneLike[], calls: readonly ToolCallLike[] = []) {
  return renderToStaticMarkup(createElement(PomeloWorkPanel, { lanes, calls }));
}

test("work lanes have headings and show their driver, model and state in model order", () => {
  const html = render([doneLane, runningLane]);
  const sections = html.match(/<section\b[^>]*>.*?<\/section>/g) ?? [];

  assert.equal(sections.length, 2);
  const [running = "", done = ""] = sections;
  assert.match(running, /<h[1-6]\b[^>]*\sdir="auto"[^>]*>מחקר<\/h[1-6]>/);
  assert.match(running, />codex</);
  assert.match(running, />model-a</);
  assert.match(running, />Running</);
  assert.match(done, /<h[1-6]\b[^>]*>Draft<\/h[1-6]>/);
  assert.match(done, />claude</);
  assert.match(done, />model-b</);
  assert.match(done, />Done</);
  assert.match(render([{ ...runningLane, state: "waiting" }]), />Waiting</);
  assert.match(render([{ ...runningLane, state: "stuck" }]), />Stuck</);
});

test("tool calls show their names and states in a list and omit extra fields", () => {
  const call = {
    id: "call-1",
    laneId: runningLane.id,
    name: "read_document",
    state: "failed",
    startedAt: 2,
    arguments: { query: "synthetic-argument-text" },
    result: "synthetic-result-text",
  } as unknown as ToolCallLike;
  const earlierCall: ToolCallLike = {
    id: "call-2",
    laneId: runningLane.id,
    name: "search_notes",
    state: "waiting",
    startedAt: 1,
  };
  const html = render([runningLane], [earlierCall, call]);
  const list = html.match(/<ul\b[^>]*>(.*?)<\/ul>/)?.[1] ?? "";
  const items = list.match(/<li\b[^>]*>.*?<\/li>/g) ?? [];

  assert.equal(items.length, 2);
  const [latest = "", earlier = ""] = items;
  assert.match(latest, />read_document</);
  assert.match(latest, />Failed</);
  assert.match(earlier, />search_notes</);
  assert.match(earlier, />Waiting</);
  assert.doesNotMatch(html, /synthetic-argument-text|synthetic-result-text|more calls/);
  assert.doesNotMatch(html, /<button\b|\s(?:autofocus|tabindex)\b/i);
});

test("a lane with more than 50 calls shows the two omitted calls in one line", () => {
  const calls: ToolCallLike[] = Array.from({ length: 52 }, (_, i) => ({
    id: `call-${i}`,
    laneId: runningLane.id,
    name: `tool_${i}`,
    state: "done",
    startedAt: i,
  }));
  const html = render([runningLane], calls);

  assert.equal(Array.from(html.matchAll(/<li\b/g)).length, 50);
  assert.equal(Array.from(html.matchAll(/>\+2 more calls</g)).length, 1);
  assert.match(html, />tool_51<.*?>Done</);
  assert.doesNotMatch(html, />tool_[01]</);
});

test("an empty panel shows one line", () => {
  assert.match(render([]), /^<p\b[^>]*>No agents are working in this thread yet\.<\/p>$/);
});
