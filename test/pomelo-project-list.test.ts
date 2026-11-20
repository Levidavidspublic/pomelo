import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectList } from "../src/client/pomelo/project-list.js";

test("counts each thread once per project and keeps slugs without a tag record", () => {
  const tags = Object.freeze([
    Object.freeze({ slug: "garden", name: "Garden", colour: "#4e6584" }),
    Object.freeze({ slug: "workshop", name: "Workshop" }),
  ]);
  const threads = Object.freeze([
    Object.freeze({ projectTags: Object.freeze(["garden", "garden", "notes"]) }),
    Object.freeze({ projectTags: Object.freeze(["garden", "garden"]), archived: true }),
    Object.freeze({ projectTags: Object.freeze(["notes"]), archived: true }),
    Object.freeze({ projectTags: Object.freeze([]) }),
  ]);

  const { rows } = buildProjectList(tags, threads);
  assert.deepEqual(rows.map(({ slug, name, threadCount, liveThreadCount, archived }) => ({
    slug, name, threadCount, liveThreadCount, archived,
  })), [
    { slug: "garden", name: "Garden", threadCount: 2, liveThreadCount: 1, archived: false },
    { slug: "notes", name: "notes", threadCount: 2, liveThreadCount: 1, archived: false },
    { slug: "workshop", name: "Workshop", threadCount: 0, liveThreadCount: 0, archived: false },
  ]);
  assert.equal(rows[0].colour, "#4e6584");
  assert.equal(rows[1].colour, undefined);
});

test("sorts live projects first, then by case-blind name and slug in each group", () => {
  const { rows } = buildProjectList([
    { slug: "old", name: "Apricot", archived: true },
    { slug: "zebra", name: "Zebra" },
    { slug: "beta", name: "BETA", archived: true },
    { slug: "garden-z", name: "garden" },
    { slug: "garden-a", name: "Garden" },
    { slug: "amber", name: "amber" },
  ], []);

  assert.deepEqual(rows.map(({ slug, archived }) => [slug, archived]), [
    ["amber", false], ["garden-a", false], ["garden-z", false], ["zebra", false],
    ["old", true], ["beta", true],
  ]);
});

test("uses the first letter to choose Hebrew or left-to-right direction", () => {
  const { rows } = buildProjectList([
    { slug: "hebrew", name: "123 (גינה) Garden" },
    { slug: "english", name: "123 (Garden) גינה" },
    { slug: "numbers", name: "123" },
  ], []);
  assert.deepEqual(Object.fromEntries(rows.map(({ slug, dir }) => [slug, dir])), {
    hebrew: "rtl", english: "ltr", numbers: "ltr",
  });
});

test("offers actions for each project state and explains when merge has no live target", () => {
  const { rows } = buildProjectList([
    { slug: "garden", name: "Garden" },
    { slug: "notes", name: "Notes", archived: true },
  ], []);

  assert.deepEqual(rows[0].actions, [
    { id: "rename", label: "Rename", enabled: true },
    { id: "merge", label: "Merge into…", enabled: false, reason: "There is no other project to merge into" },
    { id: "put-away", label: "Put away", enabled: true },
  ]);
  assert.deepEqual(rows[1].actions, [
    { id: "rename", label: "Rename", enabled: true },
    { id: "merge", label: "Merge into…", enabled: true },
    { id: "bring-back", label: "Bring back", enabled: true },
  ]);
  for (const { actions } of rows) {
    const ids: string[] = actions.map(({ id }) => id);
    assert.notEqual(ids.includes("put-away"), ids.includes("bring-back"));
    assert.equal(ids.includes("delete"), false);
  }
});

test("filters by name or slug and keeps merge targets outside the filter", () => {
  const tags = [
    { slug: "plots", name: "Community Garden" },
    { slug: "books", name: "ספרי גינה" },
  ];
  const byName = buildProjectList(tags, [], "  GARDEN ").rows;
  assert.deepEqual(byName.map(({ slug }) => slug), ["plots"]);
  assert.deepEqual(byName[0].actions.find(({ id }) => id === "merge"), {
    id: "merge", label: "Merge into…", enabled: true,
  });
  assert.deepEqual(buildProjectList(tags, [], "  PlOtS ").rows, byName);
  assert.deepEqual(buildProjectList(tags, [], "  גינה  ").rows.map(({ slug }) => slug), ["books"]);
  assert.deepEqual(buildProjectList(tags, [], "   "), buildProjectList(tags, []));
});

test("distinguishes an empty project list from a filter without matches", () => {
  assert.deepEqual(buildProjectList([], [], "notes"), { rows: [], emptyText: "No projects yet" });
  assert.deepEqual(buildProjectList([{ slug: "garden", name: "Garden" }], [], "notes"), {
    rows: [], emptyText: "No project matches",
  });
});
