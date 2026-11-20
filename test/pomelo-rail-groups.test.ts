import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UNTAGGED } from "../src/client/pomelo/rail-fold.js";
import { RailGroups, type RailGroupsProps } from "../src/client/pomelo/RailGroups.js";
import { tagColour } from "../src/client/pomelo/tag-colour.js";
import type { RecentSession } from "../src/client/storage.js";

const now = new Date(2026, 10, 19, 15).getTime();
const minute = 60_000;
const session = (sid: string, title: string, openedAt = now - 60 * minute): RecentSession => ({
  sid, title, openedAt, invite: "", role: "owner",
});
const hebrewTitle = "תכנון הפרויקט";
const defaults: RailGroupsProps = {
  rows: [
    session("notes", "Build notes", now - minute),
    session("shared", "Shared checklist"),
    session("plan", hebrewTitle),
  ],
  meta: {
    notes: { projectTags: ["build"], lastActivityAt: now - 25 * minute, runningSubagents: 0 },
    shared: { projectTags: ["build", "docs"], lastActivityAt: now - 10 * minute },
    plan: { projectTags: ["docs"], lastActivityAt: now - 5 * minute, runningSubagents: 3 },
  },
  tagLabels: { docs: "Documentation", build: "Build" },
  folded: [],
  unread: new Set(["shared"]),
  currentThreadId: "plan",
  onOpen: () => {},
  onToggleFold: () => {},
  now,
};

const render = (props: Partial<RailGroupsProps> = {}) =>
  renderToStaticMarkup(createElement(RailGroups, { ...defaults, ...props }));
const sections = (html: string) => html.match(/<section\b[^>]*>[\s\S]*?<\/section>/g) ?? [];
const rowIds = (html: string) => [...html.matchAll(/<button\b[^>]*\bdata-sid="([^"]+)"/g)]
  .map(([, sid]) => sid);

test("project groups and their rows follow latest activity, including threads shared by two tags", () => {
  const groups = sections(render());
  assert.equal(groups.length, 2);
  const [docs, build] = groups;
  assert.match(docs, />Documentation</);
  assert.match(build, />Build</);
  assert.deepEqual(rowIds(docs), ["plan", "shared"]);
  assert.deepEqual(rowIds(build), ["shared", "notes"]);
  assert.match(docs, />5m</);
  assert.match(build, />25m</);
  const { bg, fg } = tagColour("docs");
  assert.ok(docs.includes(`style="background-color:${bg};color:${fg}"`));
});

test("folded groups keep their header and hide their thread buttons", () => {
  const groups = sections(render({
    rows: [...defaults.rows, session("unfiled", "Unfiled plan")],
    folded: ["docs", UNTAGGED],
  }));
  assert.equal(groups.length, 3);
  const [docs, build, untagged] = groups;
  assert.match(docs, /<button\b[^>]*aria-expanded="false"/);
  assert.match(docs, />Documentation</);
  assert.deepEqual(rowIds(docs), []);
  assert.match(build, /<button\b[^>]*aria-expanded="true"/);
  assert.deepEqual(rowIds(build), ["shared", "notes"]);
  assert.match(untagged, /<button\b[^>]*aria-expanded="false"/);
  assert.match(untagged, />Untagged</);
  assert.deepEqual(rowIds(untagged), []);
});

test("the current thread button is marked and a Hebrew title is rendered whole", () => {
  const html = render();
  assert.match(html, /<button\b[^>]*data-sid="plan"[^>]*aria-current="page"/);
  assert.equal([...html.matchAll(/aria-current=/g)].length, 1);
  assert.match(html, new RegExp(`<span[^>]*dir="auto"[^>]*>${hebrewTitle}</span>`));
});

test("unread threads show a dot and only positive running sub-agent counts show badges", () => {
  const groups = sections(render());
  assert.equal(groups.length, 2);
  const [docs, build] = groups;
  assert.equal([...docs.matchAll(/data-unread="true"/g)].length, 1);
  assert.match(docs, /<button\b[^>]*data-sid="shared"[^>]*data-unread="true"[^>]*>[\s\S]*?>Unread</);
  assert.equal([...docs.matchAll(/class="sb-unread-dot"/g)].length, 1);
  assert.match(docs, /Running sub-agents: <\/span>3<\/span>/);
  assert.doesNotMatch(build, /Running sub-agents/);
});

test("thread titles are escaped as text", () => {
  const html = render({ rows: [session("sample", "<script>example</script>")] });
  assert.match(html, /&lt;script&gt;example&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b/);
});

test("an empty rail renders no groups", () => {
  const html = render({ rows: [] });
  assert.deepEqual(sections(html), []);
  assert.deepEqual(rowIds(html), []);
});
