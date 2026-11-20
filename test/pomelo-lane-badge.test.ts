import assert from "node:assert/strict";
import test from "node:test";
import { laneBadge } from "../src/client/pomelo/lane-badge.js";

test("zero sub-agents give no badge text or spoken label", () => {
  const badge = laneBadge({ running: 0, waiting: 0, stuck: 0 }, "en");
  assert.equal(badge.show, false);
  assert.equal(badge.text, "");
  assert.equal(badge.label, "");
});

test("one running sub-agent gives a busy badge with a singular label", () => {
  assert.deepEqual(laneBadge({ running: 1, waiting: 0, stuck: 0 }, "en"), {
    show: true,
    text: "1",
    tone: "busy",
    label: "1 sub-agent running",
  });
});

test("three running sub-agents give a plural label", () => {
  assert.equal(laneBadge({ running: 3, waiting: 0, stuck: 0 }, "en").label, "3 sub-agents running");
});

test("the badge shows nine and caps larger counts while the label keeps the full count", () => {
  assert.equal(laneBadge({ running: 9, waiting: 0, stuck: 0 }, "en").text, "9");
  assert.deepEqual(laneBadge({ running: 12, waiting: 0, stuck: 0 }, "en"), {
    show: true,
    text: "9+",
    tone: "busy",
    label: "12 sub-agents running",
  });
  assert.equal(laneBadge({ running: 7, waiting: 2, stuck: 1 }, "en").text, "9+");
});

test("waiting outranks running and the label includes both counts", () => {
  assert.deepEqual(laneBadge({ running: 3, waiting: 1, stuck: 0 }, "en"), {
    show: true,
    text: "4",
    tone: "waiting",
    label: "3 sub-agents running, 1 waiting for you",
  });
});

test("stuck outranks waiting and running and the label includes all three counts", () => {
  assert.deepEqual(laneBadge({ running: 1, waiting: 2, stuck: 1 }, "en"), {
    show: true,
    text: "4",
    tone: "stuck",
    label: "1 sub-agent running, 2 waiting for you, 1 stuck",
  });
});

test("Hebrew labels use singular and plural words with digits", () => {
  assert.equal(laneBadge({ running: 1, waiting: 0, stuck: 0 }, "he").label, "1 סוכן משנה פועל");
  assert.equal(laneBadge({ running: 0, waiting: 1, stuck: 0 }, "he").label, "1 סוכן משנה ממתין לך");
  assert.equal(laneBadge({ running: 0, waiting: 0, stuck: 2 }, "he").label, "2 סוכני משנה תקועים");
  assert.equal(
    laneBadge({ running: 3, waiting: 2, stuck: 1 }, "he-IL").label,
    "3 סוכני משנה פועלים, 2 ממתינים לך, 1 תקוע",
  );
});

test("negative, fractional, and non-number counts are treated as zero", () => {
  assert.equal(laneBadge({ running: -1, waiting: 1.5, stuck: "3" }, "en").show, false);
  assert.deepEqual(laneBadge({ running: 2, waiting: Infinity, stuck: NaN }, "en"), {
    show: true,
    text: "2",
    tone: "busy",
    label: "2 sub-agents running",
  });
});

test("an unknown language falls back to English", () => {
  assert.equal(laneBadge({ running: 0, waiting: 0, stuck: 1 }, "fr").label, "1 sub-agent stuck");
});
