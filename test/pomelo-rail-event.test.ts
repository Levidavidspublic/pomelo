import assert from "node:assert/strict";
import test from "node:test";
import { buildRailEvent } from "../src/pomelo/rail-event.js";

const thread = Object.freeze({
  sid: "draft",
  title: "Release plan",
  projectTags: Object.freeze(["docs", "review"]),
  lastActivityAt: 20,
  openedBy: "agent",
  parentThreadId: "parent",
});

test("a new thread sends one open event with its rail metadata", () => {
  for (const before of [null, undefined]) {
    assert.deepEqual(buildRailEvent(before, thread), { kind: "thread-opened", ...thread });
  }
});

test("only newer activity triggers an activity event", () => {
  assert.deepEqual(buildRailEvent(thread, { ...thread, lastActivityAt: 30 }), {
    kind: "thread-activity", sid: thread.sid, lastActivityAt: 30,
  });
  for (const lastActivityAt of [10, 20]) {
    assert.equal(buildRailEvent(thread, { ...thread, lastActivityAt }), undefined);
  }
});

test("changed tags are sorted and deduplicated without changing the record", () => {
  const projectTags = Object.freeze(["review", "build", "review", "build"]);
  assert.deepEqual(buildRailEvent(thread, { ...thread, projectTags }), {
    kind: "thread-tags", sid: thread.sid, projectTags: ["build", "review"],
  });
  assert.deepEqual(projectTags, ["review", "build", "review", "build"]);
  assert.deepEqual(buildRailEvent(thread, { ...thread, projectTags: [] }), {
    kind: "thread-tags", sid: thread.sid, projectTags: [],
  });
  assert.equal(buildRailEvent(thread, { ...thread, projectTags: ["review", "docs", "docs"] }), undefined);
});

test("a renamed thread keeps the whole Hebrew title including its vowel marks", () => {
  const title = "תִּכְנוּן הַפְּרוֹיֶקְט ".repeat(8) + "🧑🏽‍💻";
  assert.deepEqual(buildRailEvent(thread, { ...thread, title }), {
    kind: "thread-title", sid: thread.sid, title,
  });
});

test("simultaneous changes share one event with kinds in a fixed order", () => {
  assert.deepEqual(buildRailEvent(thread, { ...thread, title: "Draft", projectTags: ["build"], lastActivityAt: 30 }), {
    kind: ["thread-activity", "thread-tags", "thread-title"],
    sid: thread.sid,
    lastActivityAt: 30,
    projectTags: ["build"],
    title: "Draft",
  });
  assert.deepEqual(buildRailEvent(thread, { ...thread, title: "Draft", projectTags: [], lastActivityAt: 10 }), {
    kind: ["thread-tags", "thread-title"], sid: thread.sid, projectTags: [], title: "Draft",
  });
});

test("unchanged rail metadata and changes to non-rail fields are silent", () => {
  assert.equal(buildRailEvent(thread, { ...thread }), undefined);
  assert.equal(buildRailEvent(thread, { ...thread, prompt: "sample prompt", body: "sample body" }), undefined);
});

test("an open event only includes rail metadata", () => {
  const extra = { prompt: "sample prompt", body: "sample body", toolArgs: { path: "/sample/file.txt" } };
  assert.deepEqual(buildRailEvent(null, { ...thread, ...extra, filePath: extra.toolArgs.path }), {
    kind: "thread-opened", ...thread,
  });
});

test("a credential-shaped canary hides the entire title on opens and renames", () => {
  const canary = "RailCanaryForTest9".repeat(2);
  const after = { ...thread, title: `Draft Bearer ${canary}` };
  for (const before of [null, thread]) {
    const event = buildRailEvent(before, after);
    assert.equal(event?.title, "[hidden]");
    assert.equal(JSON.stringify(event).includes(canary), false);
  }
  assert.equal(buildRailEvent(after, { ...after, title: canary }), undefined);
});

test("invalid records give no event", () => {
  for (const invalid of [false, "draft", [], {}, { sid: " " }, { sid: 3 }, { ...thread, lastActivityAt: NaN }]) {
    assert.equal(buildRailEvent(null, invalid), undefined);
    assert.equal(buildRailEvent(invalid, thread), undefined);
  }
  assert.equal(buildRailEvent(thread, { ...thread, sid: "other" }), undefined);
});
