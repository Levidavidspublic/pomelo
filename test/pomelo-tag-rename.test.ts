import assert from "node:assert/strict";
import test from "node:test";
import { renameTag, TAG_LABEL_LIMIT } from "../src/pomelo/tag-rename.js";

const pomelo = { slug: "pomelo", label: "Pomelo", colour: "#8fa3bf", createdBy: "owner" };
const tempo = { slug: "tempo", label: "Tempo", createdBy: "agent:research" };

test("renaming changes only the label and keeps the slug used by threads", () => {
  assert.deepEqual(renameTag([pomelo, tempo], "pomelo", "Orchard"), {
    ok: true,
    tag: { ...pomelo, label: "Orchard" },
  });
});

test("renaming trims the label and collapses repeated spaces", () => {
  assert.deepEqual(renameTag([tempo], "tempo", "  Build   Notes  "), {
    ok: true,
    tag: { ...tempo, label: "Build Notes" },
  });
});

test("renaming an unknown slug returns unknown-tag", () => {
  assert.deepEqual(renameTag([pomelo], "missing", "Orchard"), { ok: false, reason: "unknown-tag" });
});

test("empty and whitespace-only labels are refused", () => {
  for (const label of ["", " \t\n\u00a0 ", "\u0000\u007f"]) {
    assert.deepEqual(renameTag([pomelo], "pomelo", label), { ok: false, reason: "empty-label" });
  }
});

test("the length limit applies to the cleaned label", () => {
  const label = "🌱".repeat(TAG_LABEL_LIMIT);
  assert.deepEqual(renameTag([pomelo], "pomelo", `  ${label}  `), {
    ok: true,
    tag: { ...pomelo, label },
  });
  assert.deepEqual(renameTag([pomelo], "pomelo", `${label}🌱`), { ok: false, reason: "too-long" });
});

test("another tag's label is taken regardless of case or spaces on either label", () => {
  const tags = [tempo, { ...pomelo, label: "  Pomelo   Notes " }];
  assert.deepEqual(renameTag(tags, "tempo", "POMELO Notes"), { ok: false, reason: "taken" });
  assert.deepEqual(renameTag([pomelo, tempo], "tempo", " POMELO "), { ok: false, reason: "taken" });
});

test("canonically equivalent Unicode labels are taken", () => {
  const cafe = { ...pomelo, label: "Cafe\u0301" };
  assert.deepEqual(renameTag([cafe, tempo], "tempo", "CAFÉ"), { ok: false, reason: "taken" });
});

test("a tag can change the case of its own label", () => {
  assert.deepEqual(renameTag([pomelo, tempo], "pomelo", "POMELO"), {
    ok: true,
    tag: { ...pomelo, label: "POMELO" },
  });
});

test("Hebrew letters and vowel marks are preserved and compared", () => {
  const label = "שָׁלוֹם עולם";
  const tag = { ...pomelo, label };
  assert.deepEqual(renameTag([pomelo, tempo], "pomelo", `  ${label}  `), { ok: true, tag });
  assert.deepEqual(renameTag([tag, tempo], "tempo", "שָׁלוֹם  עולם"), { ok: false, reason: "taken" });
});

test("controls are stripped and line breaks become spaces", () => {
  assert.deepEqual(renameTag([pomelo], "pomelo", "\u0000Build\u001b\r\nNotes\u007f\u0080\u2028Today"), {
    ok: true,
    tag: { ...pomelo, label: "Build Notes Today" },
  });
});

test("renaming leaves the input array and its objects intact", () => {
  const tags = Object.freeze([Object.freeze({ ...pomelo }), Object.freeze({ ...tempo })]);
  const result = renameTag(tags, "pomelo", "Orchard");
  assert.ok(result.ok);
  assert.notEqual(result.tag, tags[0]);
  assert.deepEqual(tags, [pomelo, tempo]);
});
