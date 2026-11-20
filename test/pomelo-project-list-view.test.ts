import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloProjectList } from "../src/client/pomelo/PomeloProjectList.js";
import { buildProjectList, type ProjectListResult } from "../src/client/pomelo/project-list.js";
import { tagColour } from "../src/client/pomelo/tag-colour.js";

const render = (result: ProjectListResult) => renderToStaticMarkup(createElement(PomeloProjectList, { result }));
const buttonLabels = (html: string) => Array.from(
  html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g),
  ([, label]) => label,
);

test("renders the project colours, thread counts, name direction and archive state in one list", () => {
  const result = buildProjectList([
    { slug: "garden", name: "Garden", colour: "#ABCDEF" },
    { slug: "notes", name: "123 (גינה) Notes", archived: true },
  ], [
    { projectTags: ["garden", "notes"] },
    { projectTags: ["garden"] },
    { projectTags: ["garden"], archived: true },
  ]);
  const html = render(result);
  assert.match(html, /^<ul\b[^>]*>[\s\S]*<\/ul>$/);
  assert.equal(html.match(/<ul\b/g)?.length, 1);
  const items = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
  assert.equal(items.length, 2);
  const [garden, notes] = items;
  assert.match(garden, /dir="ltr"[^>]*>Garden</);
  assert.match(garden, />3 threads, 2 not put away</);
  assert.match(notes, /dir="rtl"[^>]*>123 \(גינה\) Notes</);
  assert.match(notes, />1 thread</);
  assert.match(notes, /<(?!button\b)[a-z]+\b[^>]*>Put away<\//);
  assert.ok(buttonLabels(notes).includes("Bring back"));

  for (const [index, { slug, colour, actions }] of result.rows.entries()) {
    const dot = items[index].match(/<span\b[^>]*aria-hidden="true"[^>]*><\/span>/)?.[0];
    assert.ok(dot?.includes(`background-color:${tagColour(slug, colour).bg}`));
    assert.deepEqual(buttonLabels(items[index]), actions.map(({ label }) => label));
  }
  assert.equal(html.match(/<button\b[^>]*type="button"/g)?.length, 6);
});

test("shows the disabled action's reason and keeps the button in the keyboard tab order", () => {
  const result = buildProjectList([{ slug: "garden", name: "Garden" }], []);
  const html = render(result);
  assert.match(html, />No threads</);
  const merge = html.match(/<button\b[^>]*>Merge into…<\/button>/)?.[0];
  assert.ok(merge);
  assert.match(merge, /\baria-disabled="true"/);
  assert.doesNotMatch(merge, /\sdisabled(?:[\s=>])|tabindex="-1"/i);
  const reasonId = merge.match(/aria-describedby="([^"]+)"/)?.[1];
  const reason = html.match(/<p\b[^>]*\bid="([^"]+)"[^>]*>There is no other project to merge into<\/p>/);
  assert.ok(reasonId);
  assert.equal(reasonId, reason?.[1]);
});

test("renders only the model's actions, in the order and with the labels it supplies", () => {
  const result = buildProjectList([{ slug: "garden", name: "Garden" }], []);
  const [rename, , putAway] = result.rows[0].actions;
  result.rows[0].actions = [putAway, { ...rename, label: "Rename project" }];

  const html = render(result);
  assert.deepEqual(buttonLabels(html), ["Put away", "Rename project"]);
  assert.equal(html.match(/<button\b/g)?.length, 2);
});

test("renders the model's empty message as a paragraph without a list", () => {
  const result = buildProjectList([{ slug: "garden", name: "Garden" }], [], "notes");
  assert.equal(render(result), `<p>${result.emptyText}</p>`);
});
