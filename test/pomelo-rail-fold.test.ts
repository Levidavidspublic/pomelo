import assert from "node:assert/strict";
import test from "node:test";
import { cleanFolded, foldedSummary, isFolded, toggleFold, UNTAGGED } from "../src/client/pomelo/rail-fold.js";

test("toggling an unfolded slug adds it", () => {
  const folded = toggleFold(["docs"], "build");
  assert.deepEqual(folded, ["docs", "build"]);
  assert.equal(isFolded(folded, "build"), true);
});

test("toggling a folded slug removes it", () => {
  const folded = toggleFold(["docs", "build", "review"], "build");
  assert.deepEqual(folded, ["docs", "review"]);
  assert.equal(isFolded(folded, "build"), false);
});

test("toggling leaves the input array unchanged", () => {
  const folded = Object.freeze(["docs", "build"]);
  assert.deepEqual(toggleFold(folded, "review"), ["docs", "build", "review"]);
  assert.deepEqual(toggleFold(folded, "docs"), ["build"]);
  assert.deepEqual(folded, ["docs", "build"]);
});

test("cleaning drops unknown and duplicate slugs in stored order", () => {
  const folded = ["build", "deleted", "docs", "build", "review", "docs"];
  assert.deepEqual(cleanFolded(folded, ["review", "docs", "build"]), ["build", "docs", "review"]);
});

test("cleaning accepts only live strings from stored arrays", () => {
  const liveSlugs = ["docs", "build"];
  assert.deepEqual(cleanFolded(null, liveSlugs), []);
  assert.deepEqual(cleanFolded("docs", liveSlugs), []);
  assert.deepEqual(cleanFolded([false, "docs", null, 12, {}, "build"], liveSlugs), liveSlugs);
});

test("cleaning keeps the first 200 distinct live slugs", () => {
  const liveSlugs = Array.from({ length: 201 }, (_, i) => `project-${i}`);
  assert.deepEqual(cleanFolded(["deleted", liveSlugs[0], ...liveSlugs], liveSlugs), liveSlugs.slice(0, 200));
});

test("folding another group at the limit keeps the newly folded slug", () => {
  const folded = Array.from({ length: 200 }, (_, i) => `project-${i}`);
  assert.deepEqual(toggleFold(folded, "new"), [...folded.slice(1), "new"]);
});

test("the folded summary counts every thread and shows unread activity in the group", () => {
  const threads = [{ sid: "read" }, { sid: "unread" }];
  assert.deepEqual(foldedSummary(threads, new Set(["unread"])), { count: 2, hasUnread: true });
  assert.deepEqual(foldedSummary(threads, new Set(["outside"])), { count: 2, hasUnread: false });
});

test("an empty group has no threads or unread activity", () => {
  assert.deepEqual(foldedSummary([], new Set(["outside"])), { count: 0, hasUnread: false });
});

test("untagged threads use a fold separate from the project named Untagged", () => {
  const folded = toggleFold([], UNTAGGED);
  assert.deepEqual(folded, [UNTAGGED]);
  assert.equal(isFolded(folded, UNTAGGED), true);
  assert.equal(isFolded(folded, "untagged"), false);
  assert.deepEqual(cleanFolded(folded, [UNTAGGED, "untagged"]), folded);
  assert.deepEqual(toggleFold(folded, UNTAGGED), []);
});
