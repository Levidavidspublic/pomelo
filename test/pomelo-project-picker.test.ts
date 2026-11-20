import assert from "node:assert/strict";
import test from "node:test";
import { projectPicker, toggleProject } from "../src/client/pomelo/project-picker.js";

const projects = [
  { slug: "pomelo", name: "Pomelo", colour: "blue" },
  { slug: "notes", name: "POMELO notes" },
  { slug: "design", name: "עיצוב" },
  { slug: "design-notes", name: "Notes עיצוב" },
  { slug: "build", name: "Build" },
];

test("an empty query lists all projects by name within each tick state", () => {
  const result = projectPicker(projects, ["pomelo", "design-notes"], "");

  assert.deepEqual(result.rows.map(({ slug, ticked }) => [slug, ticked]), [
    ["design-notes", true],
    ["pomelo", true],
    ["build", false],
    ["notes", false],
    ["design", false],
  ]);
  assert.equal(result.rows[1]?.colour, "blue");
  assert.ok(result.rows.every((row) => row.match === null));
  assert.equal(result.canCreate, false);
  assert.equal(result.emptyNote, undefined);
});

test("an English query ignores case and surrounding whitespace", () => {
  const result = projectPicker(projects, ["notes"], "pom");

  assert.deepEqual(result.rows.map(({ name, ticked }) => [name, ticked]), [
    ["POMELO notes", true],
    ["Pomelo", false],
  ]);
  assert.deepEqual(projectPicker(projects, ["notes"], "  pom \t"), result);
  assert.equal(result.canCreate, true);
});

test("Hebrew queries match Hebrew and mixed names with ranges in display order", () => {
  const result = projectPicker(projects, ["build"], "עיצוב");

  assert.deepEqual(result.rows.map(({ name, match }) => [name, match]), [
    ["Notes עיצוב", { start: 6, end: 11 }],
    ["עיצוב", { start: 0, end: 5 }],
  ]);
  assert.deepEqual(projectPicker(projects, [], "NOTES עיצ").rows.map(({ slug }) => slug), ["design-notes"]);
});

test("highlight offsets slice the original name after normalization", () => {
  const name = "  Cafe\u0301 e\u0301tude";
  const tags = [{ slug: "cafe", name }];
  const [row] = projectPicker(tags, [], "ÉTUDE").rows;

  assert.equal(row?.name, name);
  assert.deepEqual(row?.match, { start: 8, end: 14 });
  assert.equal(row?.name.slice(row?.match?.start, row?.match?.end), "e\u0301tude");
  assert.deepEqual(projectPicker(tags, [], "Cafe\u0301 Étude"), projectPicker(tags, [], "Café Étude"));
  assert.equal(projectPicker(tags, [], "Café Étude").canCreate, false);
});

test("an original character can cover a partial match in its lowercase form", () => {
  const [row] = projectPicker([{ slug: "notes", name: "İ Notes" }], [], "i").rows;

  assert.deepEqual(row?.match, { start: 0, end: 1 });
  assert.equal(row?.name.slice(row?.match?.start, row?.match?.end), "İ");
});

test("creation requires a nonempty query and no exact cleaned name", () => {
  assert.equal(projectPicker(projects, [], " \t ").canCreate, false);
  assert.equal(projectPicker(projects, [], "pomelo ").canCreate, false);
  assert.equal(projectPicker(projects, [], "New project").canCreate, true);
});

test("the picker reports when no project matches", () => {
  const result = projectPicker(projects, ["pomelo"], "missing");

  assert.deepEqual(result.rows, []);
  assert.ok(result.emptyNote);
  assert.ok(projectPicker([], [], "").emptyNote);
});

test("toggling appends or removes the slug and deduplicates the result", () => {
  assert.deepEqual(toggleProject(["notes", "pomelo", "notes"], "build"), ["notes", "pomelo", "build"]);
  assert.deepEqual(toggleProject(["notes", "pomelo", "pomelo", "notes", "build"], "pomelo"), ["notes", "build"]);
  assert.deepEqual(toggleProject([], "pomelo"), ["pomelo"]);
});

test("the picker and toggle leave their inputs unchanged", () => {
  const tag = Object.freeze({ slug: "pomelo", name: "Pomelo", colour: "blue" });
  const tags = Object.freeze([tag]);
  const slugs = Object.freeze(["pomelo", "pomelo"]);

  const result = projectPicker(tags, slugs, "pom");
  assert.deepEqual(toggleProject(slugs, "pomelo"), []);
  assert.notEqual(result.rows[0], tag);
  assert.deepEqual(tags, [{ slug: "pomelo", name: "Pomelo", colour: "blue" }]);
  assert.deepEqual(slugs, ["pomelo", "pomelo"]);
});
