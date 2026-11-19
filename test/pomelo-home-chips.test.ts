import assert from "node:assert/strict";
import test from "node:test";
import { homeRecents, projectChips } from "../src/client/pomelo/home-chips.js";
import type { RecentSession } from "../src/client/storage.js";

const thread = (sid: string, openedAt: number): RecentSession => ({
  sid,
  title: sid,
  invite: "",
  role: "owner",
  openedAt,
});

test("Home recents use latest activity and fall back to the time a thread opened", () => {
  const active = thread("active", 10);
  const legacy = thread("legacy", 30);
  const olderActivity = thread("older-activity", 50);
  const rows = Object.freeze([legacy, olderActivity, active]);
  const meta = {
    active: { lastActivityAt: 40 },
    "older-activity": { lastActivityAt: 20 },
  };

  assert.deepEqual(homeRecents(rows, meta), [active, legacy, olderActivity]);
});

test("Home returns the five newest threads by default and accepts a custom limit", () => {
  const rows = [thread("a", 10), thread("b", 20), thread("c", 30), thread("d", 40), thread("e", 50), thread("f", 60)];
  const newest = [rows[5], rows[4], rows[3], rows[2], rows[1]];

  assert.deepEqual(homeRecents(rows, {}), newest);
  assert.deepEqual(homeRecents(rows, {}, 2), newest.slice(0, 2));
  assert.deepEqual(homeRecents(rows, {}, 0), []);
});

test("project chips count threads under each tag and follow the latest activity", () => {
  const rows = [thread("shared", 20), thread("design", 10), thread("legacy", 40), thread("untagged", 60)];
  const meta = {
    shared: { lastActivityAt: 30, projectTags: ["design", "build", "build"] },
    design: { lastActivityAt: 50, projectTags: ["design"] },
    legacy: { projectTags: ["docs"] },
  };

  assert.deepEqual(projectChips(rows, meta, { design: "Design", unused: "Unused" }), [
    { slug: "design", label: "Design", count: 2, lastActivityAt: 50 },
    { slug: "docs", label: "docs", count: 1, lastActivityAt: 40 },
    { slug: "build", label: "build", count: 1, lastActivityAt: 30 },
  ]);
  assert.deepEqual(projectChips([rows[3]], meta, {}), []);
});

test("equal activity times order threads and their project chips by session ID", () => {
  const a = thread("a", 10);
  const b = thread("b", 20);
  const meta = { a: { lastActivityAt: 20, projectTags: ["zeta"] }, b: { projectTags: ["alpha"] } };

  assert.deepEqual(homeRecents([b, a], meta), [a, b]);
  assert.deepEqual(projectChips([b, a], meta, {}).map((chip) => chip.slug), ["zeta", "alpha"]);
});

test("project chips ignore invalid tags and inherited labels", () => {
  const projectTags = JSON.parse('["", " ", null, 7, {}, "__proto__"]') as string[];
  const meta = { a: { projectTags } };

  assert.deepEqual(projectChips([thread("a", 10)], meta, {}), [
    { slug: "__proto__", label: "__proto__", count: 1, lastActivityAt: 10 },
  ]);
  assert.deepEqual(projectChips([thread("a", 10)], meta, { ["__proto__"]: "Project" }), [
    { slug: "__proto__", label: "Project", count: 1, lastActivityAt: 10 },
  ]);
});

test("Home ignores inherited metadata even for a session ID named __proto__", () => {
  const legacy = thread("__proto__", 10);
  const newer = thread("newer", 20);
  const rows = [legacy, newer];
  const meta = Object.create({ ["__proto__"]: { lastActivityAt: 30, projectTags: ["inherited"] } });

  assert.deepEqual(homeRecents(rows, meta), [newer, legacy]);
  assert.deepEqual(projectChips(rows, meta, {}), []);
});

test("empty input gives empty Home lists", () => {
  assert.deepEqual(homeRecents([], {}), []);
  assert.deepEqual(projectChips([], {}, {}), []);
});
