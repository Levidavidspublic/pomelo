import assert from "node:assert/strict";
import test from "node:test";
import { filterRail, foldText } from "../src/client/pomelo/rail-filter.js";
import type { RailGroup, RailRow } from "../src/client/pomelo/rail-order.js";

const row = (sid: string, title: string): RailRow => ({
  sid, title, invite: "fixture", role: "owner", openedAt: 1, lastActivityAt: 1, runningSubagents: 0,
});

const groups: readonly RailGroup[] = [
  { tag: "studio", label: "Atélier Notes", rows: [
    row("z", "Café  Planning"),
    row("b", "שָׁלוֹם עוֹלָם"),
    row("a", "Review Planning"),
  ] },
  { tag: "build", label: "Build", rows: [row("c", "Build Planning"), row("d", "Release")] },
  { tag: null, label: "Untagged", rows: [row("e", "Loose notes")] },
];

test("an empty filter returns the original groups and counts every row", () => {
  for (const text of ["", " \t\n "]) {
    const result = filterRail(groups, { text, tags: [] });

    assert.equal(result.groups, groups);
    assert.equal(result.shown, 6);
    assert.equal(result.total, 6);
    assert.equal(result.emptyNote, null);
  }
});

test("text matches a title regardless of case and extra whitespace", () => {
  const result = filterRail(groups, { text: "  CaFé \t planNING  ", tags: [] });

  assert.deepEqual(result.groups, [{ ...groups[0], rows: [groups[0].rows[0]] }]);
});

test("a project label or tag matches text and keeps all the group's rows", () => {
  for (const text of ["atelier notes", "studio"]) {
    const result = filterRail(groups, { text, tags: [] });

    assert.deepEqual(result.groups, [groups[0]]);
    assert.notEqual(result.groups, groups);
    assert.notEqual(result.groups[0].rows, groups[0].rows);
  }
});

test("Hebrew niqqud and Latin accents do not affect matching", () => {
  assert.equal(foldText("  Café \t שָׁלוֹם  "), "cafe שלום");

  const hebrew = filterRail(groups, { text: "שלום עולם", tags: [] });
  assert.deepEqual(hebrew.groups, [{ ...groups[0], rows: [groups[0].rows[1]] }]);

  const latin = filterRail(groups, { text: "cafe", tags: [] });
  assert.deepEqual(latin.groups, [{ ...groups[0], rows: [groups[0].rows[0]] }]);
});

test("picked tags keep only their own project groups", () => {
  const picked = filterRail(groups, { text: "", tags: ["build"] });
  assert.deepEqual(picked.groups, [groups[1]]);

  const multiple = filterRail(groups, { text: "", tags: ["build", "studio"] });
  assert.deepEqual(multiple.groups, [groups[0], groups[1]]);
});

test("text and picked tags must both match", () => {
  const matching = filterRail(groups, { text: "planning", tags: ["build"] });
  assert.deepEqual(matching.groups, [{ ...groups[1], rows: [groups[1].rows[0]] }]);

  const excluded = filterRail(groups, { text: "atelier", tags: ["build"] });
  assert.deepEqual(excluded.groups, []);
});

test("filtering keeps group and row order, preserves the input, and reports row counts", () => {
  const before = structuredClone(groups);
  const result = filterRail(groups, { text: "planning", tags: [] });

  assert.deepEqual(result.groups, [
    { ...groups[0], rows: [groups[0].rows[0], groups[0].rows[2]] },
    { ...groups[1], rows: [groups[1].rows[0]] },
  ]);
  assert.deepEqual(groups, before);
  assert.equal(result.shown, 3);
  assert.equal(result.total, 6);
  assert.equal(result.emptyNote, null);
});

test("row counts include each appearance of a thread in the rail", () => {
  const shared = row("shared", "Planning");
  const result = filterRail([
    { ...groups[0], rows: [shared] },
    { ...groups[1], rows: [shared] },
  ], { text: "planning", tags: ["build"] });

  assert.equal(result.shown, 1);
  assert.equal(result.total, 2);
});

test("no matching rows leaves no groups and gives a short empty note", () => {
  assert.deepEqual(filterRail(groups, { text: "missing", tags: [] }), {
    groups: [], shown: 0, total: 6, emptyNote: "No threads match your filters.",
  });

  const empty: RailGroup[] = [];
  assert.deepEqual(filterRail(empty, { text: "", tags: [] }), {
    groups: [], shown: 0, total: 0, emptyNote: "No threads yet.",
  });
});
