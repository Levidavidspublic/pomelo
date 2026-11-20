import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloProjectPicker } from "../src/client/pomelo/PomeloProjectPicker.js";

type PickerProps = ComponentProps<typeof PomeloProjectPicker>;

const tags = [
  { slug: "design", name: "עיצוב" },
  { slug: "garden", name: "Garden", colour: "#ABCDEF" },
  { slug: "notes", name: "Garden notes", colour: "#435678" },
];

function render(overrides: Partial<PickerProps> = {}) {
  return renderToStaticMarkup(createElement(PomeloProjectPicker, {
    tags,
    threadTagSlugs: ["garden"],
    query: "",
    onQuery: () => assert.fail("Rendering should never change the query"),
    onToggle: () => assert.fail("Rendering should never toggle a project"),
    onCreate: () => assert.fail("Rendering should never create a project"),
    ...overrides,
  }));
}

function options(html: string) {
  return [...html.matchAll(/<li\b[^>]*role="option"[^>]*>.*?<\/li>/g)].map(([row]) => row);
}

test("an empty query lists all projects and identifies the one on the thread", () => {
  const html = render();
  assert.match(html, /<ul\b[^>]*role="listbox"[^>]*aria-multiselectable="true"/);
  const rows = options(html);
  assert.equal(rows.length, tags.length);

  const [garden, notes, design] = rows;
  assert.match(garden, /aria-selected="true"/);
  assert.match(garden, />On this thread</);
  assert.match(garden, /<span\b[^>]*dir="auto"[^>]*>Garden</);
  assert.match(notes, /aria-selected="false"/);
  assert.match(notes, />Garden notes</);
  assert.match(design, /aria-selected="false"/);
  assert.match(design, /<span\b[^>]*dir="auto"[^>]*>עיצוב</);
  for (const row of rows) {
    assert.match(row, /<button\b[^>]*type="button"/);
  }
  assert.doesNotMatch(notes + design, /On this thread/);
});

test("each option has its own decorative colour dot", () => {
  const [garden, notes, design] = options(render());
  assert.match(garden, /<span\b[^>]*aria-hidden="true"[^>]*style="background-color:#abcdef"/);
  assert.match(notes, /<span\b[^>]*aria-hidden="true"[^>]*style="background-color:#435678"/);
  assert.match(design, /<span\b[^>]*aria-hidden="true"[^>]*style="background-color:#[0-9a-f]{6}"/);
});

test("Hebrew and English queries each narrow the options", () => {
  const hebrew = options(render({ query: "עיצ" }));
  assert.equal(hebrew.length, 1);
  assert.match(hebrew[0], />עיצוב</);

  const english = options(render({ query: "NOTES" }));
  assert.equal(english.length, 1);
  assert.match(english[0], />Garden notes</);
});

test("the create button follows the model's offer and uses the trimmed name", () => {
  assert.match(render({ query: "  New project  " }), /<button\b[^>]*type="button"[^>]*>Make new project &quot;New project&quot;<\/button>/);
  for (const query of ["", "  ", "Garden", "  gArDeN  "]) {
    assert.doesNotMatch(render({ query }), /Make new project/);
  }
});

test("the model's empty-result line appears when nothing matches", () => {
  const html = render({ query: "Missing" });
  assert.equal(options(html).length, 0);
  assert.equal([...html.matchAll(/>No projects match\.</g)].length, 1);
  assert.match(render({ tags: [] }), />No projects yet\.</);
});

test("project names render as text even when they look like markup", () => {
  const html = render({ tags: [{ slug: "markup", name: "<img onerror>" }] });
  assert.match(html, />&lt;img onerror&gt;</);
  assert.doesNotMatch(html, /<img\b/);
});

test("the labelled search box displays the controlled query with automatic direction", () => {
  const input = render({ query: "עיצ" }).match(/<input\b[^>]*>/)?.[0];
  assert.ok(input);
  assert.match(input, /type="search"/);
  assert.match(input, /aria-label="Search projects"/);
  assert.match(input, /dir="auto"/);
  assert.match(input, /value="עיצ"/);
  assert.doesNotMatch(input, /autofocus/i);
});
