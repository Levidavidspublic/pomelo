import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloRail, readFolded, writeFolded, type PomeloRailProps } from "../src/client/pomelo/PomeloRail.js";
import { keepThreadMeta, resetThreadMetaForTest } from "../src/client/pomelo/thread-meta-store.js";
import type { RecentSession } from "../src/client/storage.js";

const now = Date.UTC(2026, 10, 19, 15);
const minute = 60_000;
const session = (sid: string, title: string, openedAt: number): RecentSession => ({
  sid, title, openedAt, invite: "", role: "owner",
});
const defaults: PomeloRailProps = {
  rows: [
    session("notes", "Build notes", now - minute),
    session("checklist", "Build checklist", now - 60 * minute),
    session("plan", "Docs plan", now - 30 * minute),
  ],
  currentThreadId: null,
  onOpen: () => {},
  tagLabels: { build: "Build", docs: "Documentation" },
  now,
};
const meta = [
  { sid: "notes", projectTags: ["build"], lastActivityAt: now - 25 * minute },
  { sid: "checklist", projectTags: ["build"], lastActivityAt: now - 10 * minute },
  { sid: "plan", projectTags: ["docs"], lastActivityAt: now - 5 * minute },
];
const render = (props: Partial<PomeloRailProps> = {}) =>
  renderToStaticMarkup(createElement(PomeloRail, { ...defaults, ...props }));
const sections = (html: string) => html.match(/<section\b[^>]*>[\s\S]*?<\/section>/g) ?? [];
const rowIds = (html: string) => [...html.matchAll(/<button\b[^>]*\bdata-sid="([^"]+)"/g)]
  .map(([, sid]) => sid);

beforeEach(() => resetThreadMetaForTest());

test("thread metadata groups rows by project and sorts them by latest activity", () => {
  keepThreadMeta(meta);
  const groups = sections(render({ currentThreadId: "plan" }));
  assert.equal(groups.length, 2);
  const [docs, build] = groups;
  assert.match(docs, />Documentation</);
  assert.deepEqual(rowIds(docs), ["plan"]);
  assert.match(docs, /<button\b[^>]*data-sid="plan"[^>]*aria-current="page"/);
  assert.match(docs, />5m</);
  assert.match(build, />Build</);
  assert.deepEqual(rowIds(build), ["checklist", "notes"]);
});

test("an empty metadata store puts every row in the untagged group", () => {
  const groups = sections(render());
  assert.equal(groups.length, 1);
  assert.match(groups[0], />Untagged</);
  assert.deepEqual(rowIds(groups[0]), ["notes", "plan", "checklist"]);
});

test("the fold store is read once and its saved group starts folded", () => {
  keepThreadMeta(meta);
  let reads = 0;
  const groups = sections(render({
    foldStore: { read: () => { reads++; return '["docs"]'; }, write: () => {} },
  }));
  assert.equal(reads, 1);
  assert.equal(groups.length, 2);
  const [docs, build] = groups;
  assert.match(docs, />Documentation</);
  assert.match(docs, /aria-expanded="false"/);
  assert.deepEqual(rowIds(docs), []);
  assert.match(build, /aria-expanded="true"/);
  assert.deepEqual(rowIds(build), ["checklist", "notes"]);
});

for (const [name, read] of [
  ["throws on read", () => { throw new Error("Storage unavailable"); }],
  ["returns null", () => null],
  ["returns invalid JSON", () => "["],
  ["returns JSON that is not an array", () => '{"docs":true}'],
] as const) {
  test(`all groups start expanded when the fold store ${name}`, () => {
    keepThreadMeta(meta);
    const html = render({ foldStore: { read, write: () => {} } });
    assert.doesNotMatch(html, /aria-expanded="false"/);
    assert.deepEqual(rowIds(html), ["plan", "checklist", "notes"]);
  });
}

test("readFolded drops stale slugs, duplicates and non-string entries", () => {
  const foldStore = { read: () => '["docs","old","docs",42,"build"]', write: () => {} };
  assert.deepEqual(readFolded(foldStore, ["build", "docs"]), ["docs", "build"]);
});

test("writeFolded saves JSON that readFolded can read back", () => {
  let text: string | null = null;
  const foldStore = { read: () => text, write: (value: string) => { text = value; } };
  const folded = ["docs", "build"];
  writeFolded(foldStore, folded);
  assert.equal(text, JSON.stringify(folded));
  assert.deepEqual(readFolded(foldStore, ["build", "docs"]), folded);
});

test("writeFolded tolerates a failed write", () => {
  const foldStore = { read: () => null, write: () => { throw new Error("Storage unavailable"); } };
  assert.doesNotThrow(() => writeFolded(foldStore, ["docs"]));
});

test("a Hebrew tag label keeps its full text and automatic direction", () => {
  keepThreadMeta(meta);
  const label = "תכנון הפרויקט";
  const html = render({ tagLabels: { docs: label } });
  assert.match(html, new RegExp(`<span[^>]*dir="auto"[^>]*>${label}</span>`));
});
