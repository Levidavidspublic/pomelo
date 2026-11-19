import assert from "node:assert/strict";
import test from "node:test";
import { railRow, timeLabel } from "../src/client/pomelo/rail-row.js";

const now = new Date(2026, 10, 19, 15).getTime();
const minute = 60_000;
const hour = 60 * minute;
const read: ReadonlySet<string> = new Set();

test("activity today is shown in whole minutes or hours", () => {
  assert.equal(timeLabel(now - 20_000, now), "now");
  assert.equal(timeLabel(now - 5 * minute - 20_000, now), "5m");
  assert.equal(timeLabel(now - 3 * hour, now), "3h");
});

test("older activity uses local calendar days", () => {
  const afterMidnight = new Date(2026, 10, 19, 0, 15).getTime();
  const previousEvening = new Date(2026, 10, 18, 23, 45).getTime();
  const tenDaysAgo = new Date(2026, 10, 9, 15).getTime();

  assert.equal(timeLabel(previousEvening, afterMidnight), "Yesterday");
  assert.equal(timeLabel(tenDaysAgo, now), "9 Nov");
});

test("future activity is shown as now", () => {
  assert.equal(timeLabel(now + 24 * hour, now), "now");
});

test("a missing or invalid activity time leaves the label empty", () => {
  const thread = { sid: "thread", title: "Planning" };

  assert.equal(railRow(thread, read, now).timeLabel, "");
  assert.equal(timeLabel(String(now) as unknown as number, now), "");
  assert.equal(timeLabel(NaN, now), "");
});

test("the row includes its title, activity label and unread status", () => {
  const thread = { sid: "thread", title: "Planning", lastActivityAt: now - 5 * minute };
  const unread: ReadonlySet<string> = new Set(["thread"]);

  assert.deepEqual(railRow(thread, unread, now), {
    sid: "thread",
    title: "Planning",
    timeLabel: "5m",
    unread: true,
  });
  assert.equal(railRow(thread, new Set(["other"]), now).unread, false);
});

test("blank titles use Untitled and long titles are preserved", () => {
  const thread = { sid: "thread", title: "" };
  const longTitle = "Long thread title ".repeat(40).trimEnd();

  assert.equal(railRow(thread, read, now).title, "Untitled");
  assert.equal(railRow({ ...thread, title: " \t\n" }, read, now).title, "Untitled");
  assert.equal(railRow({ ...thread, title: longTitle }, read, now).title, longTitle);
});
