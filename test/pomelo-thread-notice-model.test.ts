import assert from "node:assert/strict";
import test from "node:test";
import type { RailEvent } from "../src/client/pomelo/rail-update.js";
import {
  addThreadNotice,
  dismissThreadNotice,
  noticesFor,
} from "../src/client/pomelo/thread-notice-model.js";

const empty = Object.freeze({ notices: Object.freeze([]), seen: Object.freeze([]) });
const opened = {
  type: "thread_opened",
  sid: "draft",
  parentThreadId: "planning",
  title: "Draft release notes",
  openedBy: "Researcher",
  projectTags: ["docs", "release"],
  lastActivityAt: 20,
} satisfies Extract<RailEvent, { type: "thread_opened" }> & { title: string };

test("an agent-opened thread offers a link in its parent chat", () => {
  const projectTags = [...opened.projectTags];
  const state = addThreadNotice(empty, { ...opened, projectTags });
  projectTags.push("later");

  assert.deepEqual(state, {
    notices: [{
      threadId: "draft",
      parentThreadId: "planning",
      title: "Draft release notes",
      openedBy: "Researcher",
      projectTags: ["docs", "release"],
      at: 20,
      action: "open-thread",
    }],
    seen: ["draft"],
  });
  assert.deepEqual(noticesFor(state, "planning"), state.notices);
  assert.deepEqual(noticesFor(state, "draft"), []);
  assert.deepEqual(noticesFor(state, "other"), []);
  assert.deepEqual(empty, { notices: [], seen: [] });
});

test("a repeated open leaves the first notice in place even if the parent changes", () => {
  const state = addThreadNotice(empty, opened);
  assert.equal(addThreadNotice(state, opened), state);
  assert.equal(addThreadNotice(state, { ...opened, parentThreadId: "other" }), state);
  assert.equal(noticesFor(state, "planning").length, 1);
});

test("a thread opened by the user produces no notice", () => {
  for (const openedBy of ["user", "amit"]) {
    assert.equal(addThreadNotice(empty, { ...opened, openedBy }), empty);
  }
});

test("an event without a parent or with itself as parent produces no notice", () => {
  for (const parentThreadId of [undefined, opened.sid]) {
    assert.equal(addThreadNotice(empty, { ...opened, parentThreadId }), empty);
  }
});

test("sub-agent lanes produce no thread notice", () => {
  assert.equal(addThreadNotice(empty, { ...opened, type: "lane.added", lane: { id: "research" } }), empty);
  assert.equal(addThreadNotice(empty, { ...opened, laneId: "research" }), empty);
  assert.equal(addThreadNotice(empty, { ...opened, laneId: "main" }).notices.length, 1);
});

test("distinct threads appear in arrival order", () => {
  const first = addThreadNotice(empty, opened);
  const both = addThreadNotice(first, { ...opened, sid: "outline", lastActivityAt: 10 });
  assert.deepEqual(noticesFor(both, "planning").map((notice) => notice.threadId), ["draft", "outline"]);
  assert.equal(first.notices.length, 1);
});

test("a Hebrew title keeps its original characters and order", () => {
  const title = "תִּכְנוּן הפרויקט";
  const state = addThreadNotice(empty, { ...opened, title });
  assert.equal(state.notices[0].title, title);
});

test("the 80-character title limit includes the ellipsis and keeps graphemes whole", () => {
  const prefix = `${"א".repeat(78)}👩‍💻`;
  const atLimit = `${prefix}בּ`;
  assert.equal(addThreadNotice(empty, { ...opened, title: atLimit }).notices[0].title, atLimit);
  assert.equal(addThreadNotice(empty, { ...opened, title: `${atLimit}ג` }).notices[0].title, `${prefix}…`);
});

test("titles drop control characters and fall back when empty or invalid", () => {
  const state = addThreadNotice(empty, { ...opened, title: "  Draft\u0000 \u0085notes\u202e\n  " });
  assert.equal(state.notices[0].title, "Draft notes");
  for (const title of ["", "  \u0000\t ", undefined, 42]) {
    assert.equal(addThreadNotice(empty, { ...opened, title }).notices[0].title, "New thread");
  }
});

test("dismissal removes only the matching notice and a replay cannot restore it", () => {
  const state = addThreadNotice(addThreadNotice(empty, opened), { ...opened, sid: "outline" });
  const dismissed = dismissThreadNotice(state, "draft");

  assert.deepEqual(noticesFor(dismissed, "planning").map((notice) => notice.threadId), ["outline"]);
  assert.deepEqual(dismissed.seen, ["draft", "outline"]);
  assert.equal(addThreadNotice(dismissed, opened), dismissed);
  assert.equal(dismissThreadNotice(dismissed, "draft"), dismissed);
  assert.equal(state.notices.length, 2);
});

test("malformed events and invalid identifiers or timestamps are ignored", () => {
  for (const event of [
    null,
    undefined,
    5,
    [],
    {},
    { ...opened, type: "thread_activity" },
    { ...opened, sid: 1 },
    { ...opened, parentThreadId: {} },
    { ...opened, openedBy: null },
    { ...opened, openedBy: " " },
    { ...opened, laneId: 1 },
    { ...opened, lastActivityAt: Infinity },
    { ...opened, lastActivityAt: "20" },
    { ...opened, get sid() { throw new Error("Unavailable"); } },
  ]) {
    assert.equal(addThreadNotice(empty, event), empty);
  }
  const state = addThreadNotice(empty, opened);
  assert.deepEqual(noticesFor(state, 1), []);
  assert.equal(dismissThreadNotice(state, 1), state);
});

test("only string project tags are kept", () => {
  const state = addThreadNotice(empty, { ...opened, projectTags: [null, "docs", 3, "release"] });
  assert.deepEqual(state.notices[0].projectTags, ["docs", "release"]);
  assert.deepEqual(addThreadNotice(empty, { ...opened, projectTags: "docs" }).notices[0].projectTags, []);
});
