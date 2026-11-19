import assert from "node:assert/strict";
import test from "node:test";
import { applyRailEvent, type RailEvent, type RailThread } from "../src/client/pomelo/rail-update.js";

const parent = Object.freeze({
  sid: "parent",
  projectTags: Object.freeze(["docs"]),
  lastActivityAt: 10,
  openedBy: "person",
} satisfies RailThread);
const child = Object.freeze({
  sid: "child",
  projectTags: Object.freeze(["docs", "review"]),
  lastActivityAt: 20,
  openedBy: "agent",
  parentThreadId: parent.sid,
} satisfies RailThread);
const opened = { type: "thread_opened", ...child } satisfies RailEvent;
const rows = Object.freeze([parent, child]);

test("opening a thread adds a row and leaves the input unchanged", () => {
  const input = Object.freeze([parent]);
  const projectTags = [...child.projectTags];
  const result = applyRailEvent(input, { ...opened, projectTags });

  assert.deepEqual(result, { rows, needsRefetch: false });
  assert.notEqual(result.rows, input);
  assert.equal(result.rows[0], parent);
  assert.deepEqual(input, [parent]);
  projectTags.push("draft");
  assert.deepEqual(result.rows[1].projectTags, child.projectTags);
});

test("a repeated open updates the existing row and preserves newer activity", () => {
  const listedChild = Object.freeze({ ...child, title: "Review the draft" });
  const input = Object.freeze([listedChild, parent]);
  const result = applyRailEvent(input, { ...opened, projectTags: ["build"], lastActivityAt: 15 });

  assert.deepEqual(result, {
    rows: [{ ...listedChild, projectTags: ["build"] }, parent],
    needsRefetch: false,
  });
  assert.equal(result.rows[1], parent);
});

test("activity raises the timestamp and ignores older or equal times", () => {
  const activity = { type: "thread_activity", sid: child.sid, lastActivityAt: 30 } satisfies RailEvent;
  const result = applyRailEvent(rows, activity);

  assert.deepEqual(result, { rows: [parent, { ...child, lastActivityAt: 30 }], needsRefetch: false });
  assert.equal(rows[1].lastActivityAt, 20);
  for (const lastActivityAt of [25, 30]) {
    const ignored = applyRailEvent(result.rows, { ...activity, lastActivityAt });
    assert.equal(ignored.rows, result.rows);
    assert.equal(ignored.needsRefetch, false);
  }
});

test("retagging replaces the tags and keeps the first occurrence of each tag", () => {
  const projectTags = Object.freeze(["review", "build", "review", "draft", "build"]);
  const result = applyRailEvent(rows, { type: "thread_retagged", sid: child.sid, projectTags });

  assert.deepEqual(result, {
    rows: [parent, { ...child, projectTags: ["review", "build", "draft"] }],
    needsRefetch: false,
  });
  assert.deepEqual(rows[1].projectTags, ["docs", "review"]);
});

test("removal drops only the matching row", () => {
  const result = applyRailEvent(rows, { type: "thread_removed", sid: child.sid });

  assert.deepEqual(result, { rows: [parent], needsRefetch: false });
  assert.equal(result.rows[0], parent);
  assert.deepEqual(rows, [parent, child]);
});

test("activity, retag and removal for an unknown thread request a refetch", () => {
  const events: RailEvent[] = [
    { type: "thread_activity", sid: "unknown", lastActivityAt: 30 },
    { type: "thread_retagged", sid: "unknown", projectTags: [] },
    { type: "thread_removed", sid: "unknown" },
  ];
  for (const event of events) {
    const result = applyRailEvent(rows, event);
    assert.equal(result.rows, rows);
    assert.equal(result.needsRefetch, true);
  }
});

test("malformed events are ignored", () => {
  const events = [
    null,
    { type: "thread_removed" },
    { type: "thread_removed", sid: " " },
    { ...opened, lastActivityAt: Infinity },
    { type: "thread_activity", sid: child.sid, lastActivityAt: NaN },
    { type: "thread_activity", sid: "unknown", lastActivityAt: "30" },
    { type: "thread_retagged", sid: child.sid, projectTags: "docs" },
  ];
  for (const event of events) {
    const result = applyRailEvent(rows, event);
    assert.equal(result.rows, rows);
    assert.equal(result.needsRefetch, false);
  }
});
