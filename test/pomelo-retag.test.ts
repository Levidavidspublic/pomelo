import assert from "node:assert/strict";
import test from "node:test";
import { railGroups } from "../src/client/pomelo/rail-order.js";
import { cleanTags, retagged, tagDiff } from "../src/client/pomelo/retag.js";
import type { RecentSession } from "../src/client/storage.js";

test("cleanTags trims and deduplicates comma-separated tags in first-seen order", () => {
  assert.deepEqual(cleanTags(" Pomelo, tempo ,pomelo,, "), { tags: ["pomelo", "tempo"] });
});

test("cleanTags turns separators into hyphens and drops empty tags", () => {
  const input = Object.freeze([" Docs / Review! ", "docs--review", "!!!", "Next_steps2"]);
  assert.deepEqual(cleanTags(input), { tags: ["docs-review", "next-steps2"] });
  assert.deepEqual(cleanTags(""), { tags: [] });
});

test("cleanTags rejects tags over 32 characters and lists over eight tags", () => {
  const tags = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const longest = "x".repeat(32);
  assert.deepEqual(cleanTags([...tags, " A ", ""]), { tags });
  assert.deepEqual(cleanTags(longest), { tags: [longest] });

  for (const result of [cleanTags([...tags, "i"]), cleanTags(["valid", `${longest}x`])]) {
    assert.ok("error" in result);
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
    assert.ok(!("tags" in result));
  }
});

test("retagged copies the metadata and preserves activity and running subagents", () => {
  const thread = Object.freeze({ projectTags: Object.freeze(["pomelo"]), lastActivityAt: 30, runningSubagents: 2 });
  const other = Object.freeze({ lastActivityAt: 40 });
  const meta = Object.freeze({ thread, other });
  const tags = ["tempo"];
  const next = retagged(meta, "thread", tags);

  assert.notEqual(next, meta);
  assert.notEqual(next.thread, thread);
  assert.equal(next.other, other);
  tags.push("docs");
  assert.deepEqual(next.thread, { projectTags: ["tempo"], lastActivityAt: 30, runningSubagents: 2 });
  assert.deepEqual(meta.thread.projectTags, ["pomelo"]);
});

test("railGroups moves the retagged thread to the new project or to Untagged", () => {
  const rows: RecentSession[] = [
    { sid: "thread", title: "Thread", invite: "i", role: "owner", openedAt: 10 },
    { sid: "other", title: "Other", invite: "i", role: "owner", openedAt: 20 },
  ];
  const meta = { thread: { projectTags: ["pomelo"] }, other: { projectTags: ["pomelo"] } };
  const groupRows = ({ tag, rows }: ReturnType<typeof railGroups>[number]) => [tag, rows.map(({ sid }) => sid)];

  assert.deepEqual(railGroups(rows, meta).map(groupRows), [["pomelo", ["other", "thread"]]]);
  const next = retagged(meta, "thread", ["tempo"]);
  assert.deepEqual(railGroups(rows, next).map(groupRows), [["pomelo", ["other"]], ["tempo", ["thread"]]]);
  assert.deepEqual(railGroups(rows, retagged(next, "thread", [])).map(groupRows), [["pomelo", ["other"]], [null, ["thread"]]]);
});

test("retagged adds tags when the thread has no metadata yet", () => {
  assert.deepEqual(retagged({}, "thread", ["tempo"]), { thread: { projectTags: ["tempo"] } });
});

test("tagDiff returns each added or removed tag once in input order", () => {
  assert.deepEqual(tagDiff(["old", "kept", "draft", "old"], ["new", "kept", "docs", "new"]), {
    added: ["new", "docs"],
    removed: ["old", "draft"],
  });
  assert.deepEqual(tagDiff(["a", "b"], ["b", "a"]), { added: [], removed: [] });
});
