import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterActivity, archiveThread, unarchiveThread, visibleInRail,
  type ThreadArchiveRecord,
} from "../src/pomelo/thread-archive.js";

const thread = Object.freeze({
  sid: "thread-1",
  projectTags: ["project-a", "project-b"],
  lastActivityAt: 80,
  openedBy: "agent-1",
  parentThreadId: "parent-1",
  messages: [{ text: "Sample message" }],
} satisfies ThreadArchiveRecord & { messages: { text: string }[] });
Object.freeze(thread.projectTags);
Object.freeze(thread.messages);

const archived = Object.freeze({ ...thread, archivedAt: 100 });

test("archive sets only the archive time on a new record", () => {
  const result = archiveThread(thread, 100, 0);
  assert.deepEqual(result, { ok: true, record: archived });
  assert.ok(result.ok);
  assert.notEqual(result.record, thread);
  assert.equal(Object.hasOwn(thread, "archivedAt"), false);
});

test("archiving twice keeps the original time, including zero", () => {
  const first = archiveThread(thread, 0);
  assert.ok(first.ok);
  const second = archiveThread(first.record, 100);
  assert.deepEqual(second, { ok: true, record: { ...thread, archivedAt: 0 } });
  assert.ok(second.ok);
  assert.notEqual(second.record, first.record);
});

test("unarchive clears only the archive field on a new record", () => {
  const result = unarchiveThread(archived);
  assert.deepEqual(result, { ok: true, record: thread });
  assert.ok(result.ok);
  assert.notEqual(result.record, archived);
  assert.equal(Object.hasOwn(result.record, "archivedAt"), false);
  assert.equal(archived.archivedAt, 100);

  const alreadyVisible = unarchiveThread(thread);
  assert.deepEqual(alreadyVisible, { ok: true, record: thread });
  assert.ok(alreadyVisible.ok);
  assert.notEqual(alreadyVisible.record, thread);
});

test("strictly newer activity clears an archive", () => {
  assert.deepEqual(afterActivity(archived, 101), { ok: true, record: thread });
  assert.deepEqual(afterActivity(archived, 100), { ok: true, record: archived });
  assert.deepEqual(afterActivity(archived, 99), { ok: true, record: archived });
  assert.deepEqual(afterActivity(thread, 101), { ok: true, record: thread });
  assert.equal(archived.archivedAt, 100);
});

test("the rail hides archived records and preserves the given order", () => {
  const first = Object.freeze({ ...thread, sid: "thread-2", lastActivityAt: 40 });
  const second = Object.freeze({ ...thread, sid: "thread-3", lastActivityAt: 200 });
  const atZero = Object.freeze({ ...thread, sid: "thread-4", archivedAt: 0 });
  const records = Object.freeze([archived, first, atZero, second]);

  assert.deepEqual(visibleInRail(records), [first, second]);
  assert.deepEqual(records, [archived, first, atZero, second]);
  assert.deepEqual(visibleInRail([]), []);
});

test("a running lane refuses archiving and returns the unchanged record", () => {
  assert.deepEqual(archiveThread(thread, 100, 1), { ok: false, reason: "lanes_running", record: thread });
  assert.equal(Object.hasOwn(thread, "archivedAt"), false);
});

test("missing and malformed records are refused", () => {
  for (const record of [undefined, null, {}, { ...thread, projectTags: [1] }, { ...archived, archivedAt: NaN }]) {
    const refused = { ok: false, reason: "invalid_record" };
    assert.deepEqual(archiveThread(record, 100), refused);
    assert.deepEqual(unarchiveThread(record), refused);
    assert.deepEqual(afterActivity(record, 100), refused);
    assert.deepEqual(visibleInRail([thread, record]), refused);
  }
  assert.deepEqual(visibleInRail(undefined), { ok: false, reason: "invalid_records" });
});

test("invalid timestamps and running-lane counts are refused", () => {
  for (const time of [NaN, Infinity, -Infinity, "100", undefined]) {
    assert.deepEqual(archiveThread(thread, time), { ok: false, reason: "invalid_time" });
    assert.deepEqual(afterActivity(archived, time), { ok: false, reason: "invalid_time" });
  }
  for (const count of [-1, 0.5, NaN, Infinity, "1", null]) {
    assert.deepEqual(archiveThread(thread, 100, count), { ok: false, reason: "invalid_lane_count" });
  }
});
