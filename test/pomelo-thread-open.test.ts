import assert from "node:assert/strict";
import test from "node:test";
import { newThreadFields } from "../src/pomelo/thread-open.js";

const openedBy = "agent-1";
const now = 1234;

test("a new thread inherits normalized project tags and records its parent", () => {
  const parent = { id: "parent-1", projectTags: [" Planning ", "Research", "PLANNING"] };
  const fields = newThreadFields({ parent, openedBy, now });

  assert.deepEqual(fields, {
    projectTags: ["planning", "research"],
    lastActivityAt: now,
    openedBy,
    parentThreadId: parent.id,
  });
});

test("even an already normalized parent tag list is copied", () => {
  const parent = { id: "parent-1", projectTags: ["research"] };
  const fields = newThreadFields({ parent, openedBy, now });

  assert.ok("projectTags" in fields);
  assert.deepEqual(fields.projectTags, ["research"]);
  fields.projectTags.push("review");
  assert.deepEqual(parent.projectTags, ["research"]);
});

test("explicit tags override the parent's tags and keep the first eight unique nonblank tags in order", () => {
  const parent = { id: "parent-1", projectTags: ["inherited"] };
  const tags = [" B ", "A", "b", " ", "C", "D", "E", "F", "G", "H", "I"];
  assert.deepEqual(newThreadFields({ parent, openedBy, tags, now }), {
    projectTags: ["b", "a", "c", "d", "e", "f", "g", "h"],
    lastActivityAt: now,
    openedBy,
    parentThreadId: parent.id,
  });
});

test("an explicit empty list overrides inherited tags and gets a fresh array", () => {
  const parent = { id: "parent-1", projectTags: ["research"] };
  const tags: string[] = [];
  const fields = newThreadFields({ parent, openedBy, tags, now });

  assert.ok("projectTags" in fields);
  assert.equal(fields.projectTags.length, 0);
  fields.projectTags.push("review");
  assert.deepEqual(tags, []);
  assert.deepEqual(parent.projectTags, ["research"]);
});

test("a parent without project tags still supplies the parent thread ID", () => {
  const parent = { id: "parent-1" };
  assert.deepEqual(newThreadFields({ parent, openedBy, now }), {
    projectTags: [],
    lastActivityAt: now,
    openedBy,
    parentThreadId: parent.id,
  });
});

test("a thread without a parent or explicit tags starts with no tags or parent thread ID", () => {
  assert.deepEqual(newThreadFields({ openedBy, now }), {
    projectTags: [],
    lastActivityAt: now,
    openedBy,
  });
});

test("an empty or whitespace-only opener returns an error", () => {
  for (const openedBy of ["", " \t"]) {
    const fields = newThreadFields({ openedBy, now });
    assert.ok("error" in fields);
    assert.ok(fields.error);
  }
});
