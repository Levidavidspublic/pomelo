import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloRailFilter } from "../src/client/pomelo/PomeloRailFilter.js";
import { filterRail } from "../src/client/pomelo/rail-filter.js";
import type { RailGroup, RailRow } from "../src/client/pomelo/rail-order.js";
import { tagColour } from "../src/client/pomelo/tag-colour.js";

const row = (sid: string, title: string): RailRow => ({
  sid, title, invite: "fixture", role: "owner", openedAt: 1, lastActivityAt: 1, runningSubagents: 0,
});

const groups: readonly RailGroup[] = [
  { tag: "notes", label: "Notes", rows: [row("a", "Planning")] },
  { tag: "studio", label: "סטודיו", rows: [row("b", "בדיקה")] },
  { tag: null, label: "Untagged", rows: [row("c", "Loose notes")] },
];

const badColour = "#123456;background:url(example.invalid)";
const chips = [
  { slug: "notes", label: "Notes", colour: "#E2E8EF" },
  { slug: "studio", label: "סטודיו", colour: badColour },
  { slug: "review", label: 'Review "<script>"' },
];

function render(text = "", pickedSlugs: readonly string[] = [], railGroups = groups) {
  const { shown, total, emptyNote } = filterRail(railGroups, { text, tags: pickedSlugs });
  return renderToStaticMarkup(createElement(PomeloRailFilter, {
    text, chips, pickedSlugs, shown, total, emptyNote,
    onTextChange: () => {},
    onToggleChip: () => {},
    onClearFilters: () => {},
  }));
}

test("renders a labelled search input with the current text", () => {
  const input = render("Planning").match(/<input\b[^>]*>/)?.[0] ?? "";

  assert.match(input, /\btype="search"/);
  assert.match(input, /\baria-label="Filter threads"/);
  assert.match(input, /\bvalue="Planning"/);
});

test("renders each project as a button with pressed state and visible state words", () => {
  const html = render("", ["notes"]);
  const buttons = html.match(/<button\b[^>]*\baria-pressed="(?:true|false)"[^>]*>[\s\S]*?<\/button>/g) ?? [];

  assert.equal(buttons.length, chips.length);
  for (const [index, button] of buttons.entries()) {
    const { slug, colour } = chips[index];
    const { bg, fg } = tagColour(slug, colour);
    const picked = slug === "notes";

    assert.match(button, /\btype="button"/);
    assert.ok(button.includes(`aria-pressed="${picked}"`));
    assert.ok(button.includes(picked ? ">Picked<" : ">Not picked<"));
    assert.ok(button.includes(`style="background-color:${bg};color:${fg}"`));
  }
  assert.doesNotMatch(html, /example\.invalid/);
});

test("omits the result count and clear button when filters are off", () => {
  for (const text of ["", "  ", " \u05B8 "]) {
    assert.doesNotMatch(render(text), /Showing \d+ of \d+ threads|Clear filters|No threads/);
  }
});

test("announces the model counts and offers a clear button for either kind of filter", () => {
  for (const html of [render("Planning"), render("", ["notes"])]) {
    assert.match(html, /<[^>]+\baria-live="polite"[^>]*>(?:<[^>]+>)*Showing 1 of 3 threads</);
    const clear = html.match(/<button\b[^>]*>Clear filters<\/button>/)?.[0] ?? "";
    assert.match(clear, /\btype="button"/);
  }
});

test("shows the model's empty note for no matches and an empty rail", () => {
  const noMatches = render("Missing");
  assert.match(noMatches, />Showing 0 of 3 threads</);
  assert.match(noMatches, />No threads match your filters\.</);
  assert.match(render("", [], []), />No threads yet\.</);
});

test("sets right-to-left direction on Hebrew search text and project labels", () => {
  const html = render("בדיקה");
  const input = html.match(/<input\b[^>]*>/)?.[0] ?? "";

  assert.match(input, /\bdir="rtl"/);
  assert.match(input, /\bvalue="בדיקה"/);
  assert.match(html, /<[^>]+\bdir="rtl"[^>]*>סטודיו</);
});

test("escapes project labels and renders without autofocus or looping animation", () => {
  const html = render("", ["review"]);

  assert.ok(html.includes(">Review &quot;&lt;script&gt;&quot;<"));
  assert.doesNotMatch(html, /<\/?script\b|\sautofocus\b|animate-(?:pulse|spin)/i);
});
