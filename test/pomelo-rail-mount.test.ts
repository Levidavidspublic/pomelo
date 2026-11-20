import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { railMountProps } from "../src/client/pomelo/rail-mount.js";
import { railGroups } from "../src/client/pomelo/rail-order.js";
import type { RecentSession } from "../src/client/storage.js";

const now = Date.UTC(2026, 10, 19, 15);
const notes: RecentSession = { sid: "notes", title: "Build notes", openedAt: now - 120_000, invite: "", role: "owner" };
const plan: RecentSession = { sid: "plan", title: "Build plan", openedAt: now - 60_000, invite: "", role: "owner" };
const rows = [notes, plan];
const meta = { plan: { projectTags: ["build"], lastActivityAt: now - 30_000 } };
const ignoreOpen = () => {};

test("no sessions means no rail, even with tagged metadata", () => {
  assert.equal(railMountProps([], meta, null, now, ignoreOpen), null);
});

test("no session has a project tag", () => {
  assert.equal(railMountProps(rows, {
    notes: { lastActivityAt: now },
    plan: { projectTags: [] },
    stale: { projectTags: ["build"] },
  }, null, now, ignoreOpen), null);
});

test("a tagged session enables the rail and keeps all rows in input order", () => {
  const tagLabels = { build: "Build" };
  const props = railMountProps(rows, meta, plan.sid, now, ignoreOpen, tagLabels);
  assert.ok(props);
  assert.deepEqual(props.rows, [notes, plan]);
  assert.equal(props.currentThreadId, plan.sid);
  assert.equal(props.now, now);
  assert.deepEqual(props.tagLabels, tagLabels);
});

test("a session missing metadata stays in the untagged group", () => {
  const props = railMountProps(rows, meta, null, now, ignoreOpen);
  assert.ok(props);
  const groups = railGroups(props.rows, meta, props.tagLabels);
  assert.deepEqual(groups.map(({ tag, rows }) => [tag, rows.map(({ sid }) => sid)]), [
    ["build", [plan.sid]],
    [null, [notes.sid]],
  ]);
});

test("a Hebrew tag label passes through whole", () => {
  const label = "תכנון הפרויקט";
  const props = railMountProps(rows, meta, null, now, ignoreOpen, { build: label });
  assert.ok(props);
  assert.equal(props.tagLabels?.build, label);
});

test("the rail hands the original session to Friday's open handler", () => {
  const opened: RecentSession[] = [];
  const props = railMountProps(rows, meta, null, now, (session) => opened.push(session));
  assert.ok(props);
  props.onOpen("unknown");
  props.onOpen(notes.sid);
  assert.equal(opened.length, 1);
  assert.equal(opened[0], notes);
});

test("Sidebar imports the rail and its mount helper once each", () => {
  const source = readFileSync(new URL("../src/client/Sidebar.tsx", import.meta.url), "utf8");
  for (const module of ["PomeloRail", "rail-mount"]) {
    const imports = source.match(new RegExp(`^import\\s+[^;]+?from\\s+["']\\./pomelo/${module}\\.js["']`, "gm"));
    assert.equal(imports?.length, 1, module);
  }
});

test("the patch ledger has a row for the sidebar hook", () => {
  const ledger = readFileSync(new URL("../PATCHES.md", import.meta.url), "utf8");
  assert.match(ledger, /^\| `src\/client\/Sidebar\.tsx` \|[^\n]+\| #712 \|$/m);
});
