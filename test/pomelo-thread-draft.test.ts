import assert from "node:assert/strict";
import test from "node:test";
import { clearDraft, fromStored, getDraft, pruneDrafts, setDraft, toStored, type ThreadDraftState } from "../src/client/pomelo/thread-draft.js";

const empty: ThreadDraftState = Object.freeze({ drafts: Object.freeze({}) });

test("drafts stay with their own thread when a new thread opens or the active thread changes", () => {
  let activeThread = "parent";
  let state = setDraft(empty, activeThread, "First draft", 10);
  assert.equal(getDraft(state, activeThread), "First draft");

  activeThread = "child";
  assert.equal(getDraft(state, activeThread), "");
  state = setDraft(state, activeThread, "Second draft", 20);
  activeThread = "parent";
  assert.equal(getDraft(state, activeThread), "First draft");
  state = setDraft(state, activeThread, "First draft, revised", 30);
  activeThread = "child";
  assert.equal(getDraft(state, activeThread), "Second draft");
  activeThread = "parent";
  assert.equal(getDraft(state, activeThread), "First draft, revised");
});

test("clearing a sent draft leaves the other draft in place", () => {
  const state = setDraft(setDraft(empty, "first", "Send this", 10), "second", "Keep this", 20);
  const cleared = clearDraft(state, "first");
  assert.deepEqual(cleared.drafts, { second: { text: "Keep this", updatedAt: 20 } });
  assert.equal(getDraft(state, "first"), "Send this");
});

test("blank drafts are dropped and other text keeps its original whitespace and script", () => {
  const hebrew = "שָׁלוֹם";
  const mixed = `  ${hebrew} Friday 👩🏽‍💻\n`;
  const state = setDraft(setDraft(empty, "hebrew", hebrew, 1), "mixed", mixed, 2);
  assert.equal(getDraft(state, "hebrew"), hebrew);
  assert.equal(getDraft(state, "mixed"), mixed);
  for (const blank of ["", "   ", " \n\t "]) {
    assert.deepEqual(setDraft(empty, "blank", blank, 3), empty);
    assert.deepEqual(setDraft(state, "mixed", blank, 3).drafts, { hebrew: { text: hebrew, updatedAt: 1 } });
  }
});

test("the 20,000 character cap retains only whole graphemes", () => {
  for (const grapheme of ["שָׁ", "👩🏽‍💻"]) {
    const atLimit = "a".repeat(20_000 - grapheme.length) + grapheme;
    assert.equal(getDraft(setDraft(empty, "thread", atLimit + "b", 1), "thread"), atLimit);

    const beforeLimit = "a".repeat(19_999);
    assert.equal(getDraft(setDraft(empty, "thread", beforeLimit + grapheme, 1), "thread"), beforeLimit);
  }
  assert.deepEqual(setDraft(empty, "thread", " ".repeat(20_000) + "a", 1), empty);
});

test("the 50-draft limit evicts the oldest timestamp and editing refreshes it", () => {
  let state = empty;
  for (let index = 0; index < 50; index++) {
    state = setDraft(state, `thread-${index}`, "Draft", index);
  }
  state = setDraft(state, "thread-0", "Edited draft", 60);
  const updated = setDraft(state, "newest", "New draft", 61);
  assert.equal(Object.keys(updated.drafts).length, 50);
  assert.equal(getDraft(updated, "thread-0"), "Edited draft");
  assert.equal(getDraft(updated, "thread-1"), "");
  assert.equal(getDraft(updated, "newest"), "New draft");
  assert.deepEqual(setDraft(updated, "late-update", "Old draft", -1), updated);
  assert.equal(getDraft(state, "thread-1"), "Draft");
});

test("pruning keeps live threads and applies a smaller limit to their newest drafts", () => {
  const first = setDraft(empty, "first", "First", 10);
  const second = setDraft(first, "second", "Second", 20);
  const state = setDraft(second, "gone", "Gone", 30);

  assert.deepEqual(pruneDrafts(state, ["first", "second", "new-thread"], 50), second);
  assert.deepEqual(pruneDrafts(state, new Set(["first", "second"]), 1).drafts, {
    second: { text: "Second", updatedAt: 20 },
  });
  assert.deepEqual(pruneDrafts(state, ["first"], 0), empty);
  assert.deepEqual(pruneDrafts(state, [], 50), empty);
  assert.equal(getDraft(state, "gone"), "Gone");
});

test("version 1 storage round-trips text and caller-supplied timestamps", () => {
  const state = setDraft(setDraft(empty, "first", "שָׁלוֹם\nHello", 0), "second", "  Draft  ", 20);
  const stored = toStored(state);
  assert.deepEqual(JSON.parse(stored), {
    v: 1,
    drafts: {
      first: { text: "שָׁלוֹם\nHello", updatedAt: 0 },
      second: { text: "  Draft  ", updatedAt: 20 },
    },
  });
  assert.deepEqual(fromStored(stored), state);
  assert.deepEqual(fromStored(toStored(empty)), empty);
});

test("loading storage enforces both caps and drops blank drafts", () => {
  const drafts = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [
    `thread-${index}`, { text: "Draft", updatedAt: index },
  ]));
  drafts["thread-50"] = { text: "a".repeat(19_999) + "👩🏽‍💻", updatedAt: 50 };
  drafts.blank = { text: "   ", updatedAt: 51 };
  const state = fromStored(JSON.stringify({ v: 1, drafts }));

  assert.equal(Object.keys(state.drafts).length, 50);
  assert.equal(getDraft(state, "thread-0"), "");
  assert.equal(getDraft(state, "blank"), "");
  assert.equal(getDraft(state, "thread-50"), "a".repeat(19_999));
});

test("bad or old stored data resets the entire state", () => {
  for (const text of [
    null,
    undefined,
    "",
    "{",
    "null",
    "[]",
    '{"v":0,"drafts":{"first":{"text":"Old draft","updatedAt":1}}}',
    '{"first":"Old draft"}',
    '{"v":"1","drafts":{}}',
    '{"v":1,"drafts":[]}',
    '{"v":1,"drafts":null}',
    '{"v":1,"drafts":{"first":{"text":"Draft","updatedAt":1},"bad":{"text":7,"updatedAt":1}}}',
    '{"v":1,"drafts":{"first":{"text":"Draft","updatedAt":"1"}}}',
    '{"v":1,"drafts":{"first":{"text":"Draft"}}}',
    '{"v":1,"drafts":{"first":{"text":"Draft","updatedAt":1e400}}}',
    '{"v":1,"drafts":{"first":null}}',
    '{"v":1,"drafts":{"bad/id":{"text":"Draft","updatedAt":1}}}',
    '{"v":1,"drafts":{"__proto__":{"text":"Draft","updatedAt":1}}}',
  ]) {
    assert.deepEqual(fromStored(text), empty);
  }
});

test("invalid thread IDs and timestamps leave drafts alone", () => {
  const state = setDraft(empty, "thread_01", "Draft", 1);
  for (const threadId of ["", "with/slash", "x".repeat(129), "white space", "line\n", "__proto__", "constructor", "prototype"]) {
    assert.deepEqual(setDraft(state, threadId, "Ignored", 2), state);
    assert.deepEqual(clearDraft(state, threadId), state);
    assert.equal(getDraft(state, threadId), "");
  }
  assert.equal(getDraft(state, "toString"), "");
  for (const invalidTime of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(setDraft(state, "thread_01", "Ignored", invalidTime), state);
  }
});

test("state updates work on frozen input and return new state", () => {
  const state: ThreadDraftState = Object.freeze({
    drafts: Object.freeze({ first: Object.freeze({ text: "Draft", updatedAt: 1 }) }),
  });
  assert.notStrictEqual(setDraft(state, "first", "Edited", 2), state);
  assert.notStrictEqual(clearDraft(state, "first"), state);
  assert.notStrictEqual(pruneDrafts(state, [], 50), state);
  assert.deepEqual(state.drafts, { first: { text: "Draft", updatedAt: 1 } });
});
