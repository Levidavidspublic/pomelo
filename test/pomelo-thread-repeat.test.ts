import assert from "node:assert/strict";
import test from "node:test";
import { REPEAT_WINDOW_MS, threadRepeat } from "../src/pomelo/thread-repeat.js";

const ask = {
  parentThreadId: "parent-1",
  openedBy: "lane-1",
  title: "Draft a ticket",
  projectTags: ["planning", "research"],
  now: 1_000_000,
};

const earlier = {
  id: "thread-1",
  parentThreadId: ask.parentThreadId,
  openedBy: ask.openedBy,
  title: ask.title,
  projectTags: [...ask.projectTags],
  lastActivityAt: ask.now - 1000,
};

test("the same parent, lane, title and tags within the window reuse the thread", () => {
  assert.deepEqual(threadRepeat(ask, [earlier]), { action: "reuse", threadId: earlier.id });
});

test("the repeat window includes both endpoints and expires after two minutes", () => {
  assert.equal(REPEAT_WINDOW_MS, 120_000);
  for (const age of [0, REPEAT_WINDOW_MS]) {
    const thread = { ...earlier, lastActivityAt: ask.now - age };
    assert.deepEqual(threadRepeat(ask, [thread]), { action: "reuse", threadId: earlier.id });
  }
  const expired = { ...earlier, lastActivityAt: ask.now - REPEAT_WINDOW_MS - 1 };
  assert.deepEqual(threadRepeat(ask, [expired]), { action: "open" });
});

test("the same title from another lane opens a new thread", () => {
  assert.deepEqual(threadRepeat(ask, [{ ...earlier, openedBy: "lane-2" }]), { action: "open" });
});

test("matching titles ignore case, runs of spaces and leading or trailing spaces", () => {
  const request = { ...ask, title: "  draft A   TICket" };
  const thread = { ...earlier, title: "Draft  a Ticket  " };
  assert.deepEqual(threadRepeat(request, [thread]), { action: "reuse", threadId: earlier.id });
});

test("a different title opens a new thread", () => {
  assert.deepEqual(threadRepeat(ask, [{ ...earlier, title: "Review a ticket" }]), { action: "open" });
});

test("matching tag sets ignore order and duplicates on either side", () => {
  const request = { ...ask, projectTags: ["planning", "planning", "research"] };
  const thread = { ...earlier, projectTags: ["research", "planning", "research", "research"] };
  assert.deepEqual(threadRepeat(request, [thread]), { action: "reuse", threadId: earlier.id });
});

test("a different tag set opens a new thread", () => {
  for (const projectTags of [["planning"], ["planning", "review"], ["planning", "research", "review"]]) {
    assert.deepEqual(threadRepeat(ask, [{ ...earlier, projectTags }]), { action: "open" });
  }
});

test("a thread with a different or missing parent is ignored", () => {
  for (const parentThreadId of ["parent-2", undefined]) {
    assert.deepEqual(threadRepeat(ask, [{ ...earlier, parentThreadId }]), { action: "open" });
  }
});

test("an empty list opens a new thread", () => {
  assert.deepEqual(threadRepeat(ask, []), { action: "open" });
});

test("the newest matching thread is reused regardless of input order", () => {
  const newer = { ...earlier, id: "thread-2", lastActivityAt: ask.now - 500 };
  for (const threads of [[earlier, newer], [newer, earlier]]) {
    assert.deepEqual(threadRepeat(ask, threads), { action: "reuse", threadId: newer.id });
  }
});

test("a thread with activity in the future is ignored", () => {
  const future = { ...earlier, id: "future-thread", lastActivityAt: ask.now + 1 };
  assert.deepEqual(threadRepeat(ask, [future]), { action: "open" });
  assert.deepEqual(threadRepeat(ask, [future, earlier]), { action: "reuse", threadId: earlier.id });
});
