import assert from "node:assert/strict";
import test from "node:test";
import { archiveTag, nameTaken, restoreTag, tagChoices, visibleGroups } from "../src/pomelo/tag-archive.js";

const docs = Object.freeze({ slug: "docs", name: "Build Notes" });
const garden = Object.freeze({ slug: "garden", name: "Garden" });
const archivedDocs = Object.freeze({ ...docs, archivedAt: 0 });
const tags = Object.freeze([docs, garden]);
const archivedTags = Object.freeze([archivedDocs, garden]);
const threads = Object.freeze([
  Object.freeze({ sid: "docs-only", projectTags: Object.freeze(["docs"]) }),
  Object.freeze({ sid: "shared", projectTags: Object.freeze(["docs", "garden"]) }),
  Object.freeze({ sid: "garden-only", projectTags: Object.freeze(["garden", "garden"]) }),
  Object.freeze({ sid: "unfiled", projectTags: Object.freeze([]) }),
]);

test("Amit can archive a project with the supplied time without changing the inputs", () => {
  const result = archiveTag(tags, "docs", "amit", 0);

  assert.deepEqual(result, { ok: true, tags: archivedTags });
  assert.notEqual(result.tags, tags);
  assert.equal(result.tags.length, tags.length);
  assert.equal(Object.hasOwn(docs, "archivedAt"), false);
});

test("agents cannot archive or restore projects", () => {
  const archive = archiveTag(tags, "docs", "agent", 1);
  const restore = restoreTag(archivedTags, "docs", "agent:review");

  assert.deepEqual(archive, { ok: false, tags, reason: "Only Amit can archive projects." });
  assert.deepEqual(restore, { ok: false, tags: archivedTags, reason: "Only Amit can restore projects." });
  assert.notEqual(archive.tags, tags);
  assert.notEqual(restore.tags, archivedTags);
});

test("unknown and already archived projects are refused with different reasons", () => {
  const unknown = archiveTag(tags, "missing", "amit", 1);
  const alreadyArchived = archiveTag(archivedTags, "docs", "amit", 1);

  assert.deepEqual(unknown, { ok: false, tags, reason: "Project not found." });
  assert.deepEqual(alreadyArchived, { ok: false, tags: archivedTags, reason: "Project is already archived." });
  assert.notEqual(unknown.tags, tags);
  assert.notEqual(alreadyArchived.tags, archivedTags);
});

test("restore clears the archive time and refuses active or unknown projects", () => {
  const restored = restoreTag(archivedTags, "docs", "amit");

  assert.deepEqual(restored, { ok: true, tags });
  assert.notEqual(restored.tags, archivedTags);
  assert.equal(archivedDocs.archivedAt, 0);
  assert.deepEqual(restoreTag(tags, "docs", "amit"), { ok: false, tags, reason: "Project is not archived." });
  assert.deepEqual(restoreTag(tags, "missing", "amit"), { ok: false, tags, reason: "Project not found." });
});

test("the rail uses the first available tag and files threads without one under untagged", () => {
  assert.deepEqual(visibleGroups(tags, threads), {
    docs: ["docs-only", "shared"],
    garden: ["garden-only"],
    untagged: ["unfiled"],
  });
  assert.deepEqual(visibleGroups(archivedTags, threads), {
    garden: ["shared", "garden-only"],
    untagged: ["docs-only", "unfiled"],
  });
  assert.deepEqual(visibleGroups(archivedTags, [...threads, threads[1]]), visibleGroups(archivedTags, threads));
  assert.deepEqual(threads.map(({ projectTags }) => projectTags), [
    ["docs"], ["docs", "garden"], ["garden", "garden"], [],
  ]);
});

test("archived projects disappear from choices and still reserve their names", () => {
  assert.deepEqual(tagChoices(archivedTags), [garden]);
  assert.deepEqual(tagChoices(tags), tags);
  assert.notEqual(tagChoices(tags), tags);
  assert.equal(nameTaken(archivedTags, " \tBUILD   notes  "), true);
  assert.equal(nameTaken(archivedTags, "garden"), true);
  assert.equal(nameTaken(archivedTags, "Other"), false);

  const hebrewTags = [{ slug: "hello", name: "  שָׁלוֹם   עולם  ", archivedAt: 2 }];
  assert.equal(nameTaken(hebrewTags, "שָׁלוֹם עולם "), true);
});

test("archiving, refusals, and restoring preserve every tag record and thread sid", () => {
  const tagSlugs = tags.map(({ slug }) => slug);
  const threadSids = threads.map(({ sid }) => sid).sort();
  const archived = archiveTag(tags, "docs", "amit", 1).tags;
  const restored = restoreTag(archived, "docs", "amit").tags;

  for (const state of [
    tags,
    archived,
    archiveTag(archived, "docs", "amit", 2).tags,
    archiveTag(tags, "missing", "amit", 2).tags,
    archiveTag(tags, "docs", "agent", 2).tags,
    restoreTag(archived, "docs", "agent").tags,
    restoreTag(tags, "docs", "amit").tags,
    restoreTag(tags, "missing", "amit").tags,
    restored,
  ]) {
    assert.deepEqual(state.map(({ slug }) => slug), tagSlugs);
    assert.deepEqual(Object.values(visibleGroups(state, threads)).flat().sort(), threadSids);
    assert.equal(nameTaken(state, docs.name), true);
    tagChoices(state);
    assert.deepEqual(state.map(({ slug }) => slug), tagSlugs);
    assert.deepEqual(threads.map(({ sid }) => sid).sort(), threadSids);
  }
  assert.deepEqual(restored, tags);
  assert.deepEqual(visibleGroups(restored, threads), visibleGroups(tags, threads));
});
