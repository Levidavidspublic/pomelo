import assert from "node:assert/strict";
import test from "node:test";
import { isUnread, markSeen, parseSeen, serializeSeen, unreadCount, type SeenState } from "../src/client/pomelo/thread-seen.js";

const empty: SeenState = { seenAt: Object.freeze({}) };

test("unseen threads with activity are unread", () => {
  assert.equal(isUnread(empty, "new", 0), true);
});

test("marking a thread seen changes only its seen time and leaves the input intact", () => {
  const state: SeenState = Object.freeze({ seenAt: Object.freeze({ build: 100, review: 120 }) });
  const seen = markSeen(state, "build", 200);

  assert.notStrictEqual(seen, state);
  assert.deepEqual(seen.seenAt, { build: 200, review: 120 });
  assert.deepEqual(state.seenAt, { build: 100, review: 120 });
  assert.equal(isUnread(seen, "build", 199), false);
  assert.equal(isUnread(seen, "build", 200), false);
  assert.equal(isUnread(seen, "build", 201), true);
});

test("open threads stay read even with new activity or no stored seen time", () => {
  const open: SeenState = { ...empty, activeSid: "build" };
  const seen = markSeen(open, "build", 100);

  assert.equal(isUnread(open, "build", 150), false);
  assert.equal(isUnread(seen, "build", 150), false);
  assert.equal(isUnread({ ...seen, activeSid: null }, "build", 150), true);
});

test("ISO timestamps compare in milliseconds and unreadable activity counts as read", () => {
  const at = 1_800_000_000_000;
  const seen = markSeen(empty, "build", at);

  assert.equal(isUnread(seen, "build", new Date(at).toISOString()), false);
  assert.equal(isUnread(seen, "build", new Date(at + 1).toISOString()), true);
  assert.equal(isUnread(seen, "build", new Date(at + 1).toISOString().slice(0, -1)), true);
  for (const value of [undefined, null, NaN, Infinity, "", "soon", "123"]) {
    assert.equal(isUnread(empty, "new", value), false);
  }
});

test("the folded count includes only unread rows in the supplied group", () => {
  const seen = { ...markSeen(empty, "build", 100), activeSid: "open" };
  assert.equal(unreadCount(seen, [
    { sid: "build", lastActivityAt: 100 },
    { sid: "open", lastActivityAt: 150 },
    { sid: "new", lastActivityAt: 150 },
    { sid: "another", lastActivityAt: "2026-11-19T12:00:00Z" },
    { sid: "idle" },
  ]), 2);
  assert.equal(unreadCount(seen, []), 0);
});

test("seen times round trip without persisting the open thread", () => {
  const seen = markSeen(markSeen(empty, "build", 0), "review", 200);
  const open = { ...seen, activeSid: "build" };

  assert.deepEqual(parseSeen(serializeSeen(open)), seen);
  assert.equal(isUnread(seen, "build", 0), false);
});

test("invalid stored data resets all seen times", () => {
  const invalid = [
    null,
    "{",
    "[]",
    "null",
    " ".repeat(1024 * 1024) + '{"build":100}',
    '{"build":100,"review":"200"}',
    '{"build":100,"review":null}',
    '{"build":100,"review":1e400}',
    '{"build":100,"":200}',
    '{"build":100,"bad id":200}',
    '{"build":100,"__proto__":200}',
  ];
  for (const text of invalid) assert.deepEqual(parseSeen(text), empty);
});

test("marking and loading keep the 500 most recent seen times", () => {
  const entries = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`thread-${i}`, 500 - i]));
  const state: SeenState = { seenAt: entries };
  const text = JSON.stringify({ ...entries, newest: 501 });

  for (const seen of [markSeen(state, "newest", 501), parseSeen(text)]) {
    assert.equal(Object.keys(seen.seenAt).length, 500);
    assert.equal(seen.seenAt["thread-499"], undefined);
    assert.equal(seen.seenAt["thread-0"], 500);
    assert.equal(seen.seenAt.newest, 501);
  }
  assert.equal(state.seenAt["thread-499"], 1);
});
