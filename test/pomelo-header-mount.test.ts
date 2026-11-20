import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { headerMountProps } from "../src/client/pomelo/header-mount.js";
import { threadOrigin } from "../src/client/pomelo/thread-origin.js";
import type { RecentSession } from "../src/client/storage.js";

const parent: RecentSession = { sid: "plan", title: "Build plan", invite: "", role: "owner", openedAt: 1 };
const child: RecentSession = { ...parent, sid: "draft", title: "Draft", openedAt: 2 };
const sessions = [child, parent];
const agentMeta = { openedBy: "Researcher", parentThreadId: parent.sid };
const ignoreOpen = () => {};

test("a session without tags or an agent opener has no header props", () => {
  for (const meta of [
    {},
    { [child.sid]: { lastActivityAt: 2 } },
    { [child.sid]: { projectTags: [], parentThreadId: parent.sid } },
    { [child.sid]: { openedBy: " " } },
    { [child.sid]: { openedBy: "amit" } },
    { [child.sid]: { openedBy: "user" } },
    { [parent.sid]: { projectTags: ["build"] } },
  ]) {
    assert.equal(headerMountProps(child.sid, meta, sessions, ignoreOpen), null);
  }
});

test("tagged sessions get chip props in their original tag order", () => {
  const projectTags = ["release", "build", "docs"];
  const props = headerMountProps(child.sid, { [child.sid]: { projectTags } }, sessions, ignoreOpen);
  assert.ok(props?.chips);
  assert.deepEqual(props.chips.tags, projectTags);
  assert.equal(props.origin, null);
});

test("an agent-opened session gets the model's origin and the recent parent title", () => {
  const props = headerMountProps(child.sid, { [child.sid]: agentMeta }, [parent], ignoreOpen);
  assert.ok(props?.origin);
  assert.equal(props.chips, null);
  assert.deepEqual(props.origin.origin, threadOrigin({ ...child, ...agentMeta }, new Map([[parent.sid, parent]])));
  assert.equal(props.origin.origin.parent?.title, parent.title);
});

test("a missing parent gets a note and does not call the open handler", () => {
  const opened: RecentSession[] = [];
  const props = headerMountProps(child.sid, { [child.sid]: agentMeta }, [child], (row) => opened.push(row));
  assert.ok(props?.origin);
  assert.equal(props.origin.origin.note, "parent thread not found");
  assert.equal(props.origin.origin.parent, null);
  props.origin.onOpenParent(parent.sid);
  assert.deepEqual(opened, []);
});

test("a parent loop gets the origin model's note", () => {
  const props = headerMountProps(child.sid, {
    [child.sid]: agentMeta,
    [parent.sid]: { parentThreadId: child.sid },
  }, sessions, ignoreOpen);
  assert.ok(props?.origin);
  assert.equal(props.origin.origin.note, "parent thread loop");
});

test("the parent link hands Friday the original parent row when pressed", () => {
  const opened: RecentSession[] = [];
  const props = headerMountProps(child.sid, { [child.sid]: agentMeta }, sessions, (row) => opened.push(row));
  assert.ok(props?.origin);
  assert.deepEqual(opened, []);
  props.origin.onOpenParent("unknown");
  props.origin.onOpenParent(child.sid);
  props.origin.onOpenParent(parent.sid);
  assert.equal(opened.length, 1);
  assert.equal(opened[0], parent);
});

test("Hebrew tags, tag labels and parent titles pass through unchanged", () => {
  const tag = "עיצוב";
  const label = "תכנון הפרויקט";
  const title = "תִּכְנוּן הבנייה";
  const props = headerMountProps(child.sid, {
    [child.sid]: { ...agentMeta, projectTags: [tag] },
  }, [child, { ...parent, title }], ignoreOpen, { [tag]: label });
  assert.ok(props?.chips);
  assert.deepEqual(props.chips.tags, [tag]);
  assert.equal(props.chips.labels?.[tag], label);
  assert.equal(props.origin?.origin.parent?.title, title);
});

test("inherited session metadata is ignored", () => {
  const meta = Object.create({ [child.sid]: { projectTags: ["build"] } });
  assert.equal(headerMountProps(child.sid, meta, sessions, ignoreOpen), null);
  assert.equal(headerMountProps("__proto__", {}, sessions, ignoreOpen), null);
});

test("SessionView mounts the header through a small Pomelo hook", () => {
  const source = readFileSync(new URL("../src/client/SessionView.tsx", import.meta.url), "utf8");
  assert.match(source, /^import \{ headerMountProps \} from "\.\/pomelo\/header-mount\.js";$/m);
  assert.match(source, /<PomeloTagChips\b/);
  assert.match(source, /<PomeloThreadOrigin\b/);
  const pomeloLines = source.split("\n").filter((line) => /pomelo/i.test(line));
  assert.ok(pomeloLines.length <= 12, `Found ${pomeloLines.length} Pomelo lines`);
});
