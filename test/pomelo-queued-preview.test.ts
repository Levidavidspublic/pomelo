import assert from "node:assert/strict";
import test from "node:test";
import { addQueued, previewRows, removeQueued, replaceQueued, takeNext, type QueuedPreviewState } from "../src/client/pomelo/queued-preview.js";

const empty: QueuedPreviewState = { queues: {} };
const thread = "thread-a";

function addThree(): QueuedPreviewState {
  let state = empty;
  for (const id of ["first", "second", "third"]) {
    const result = addQueued(state, thread, { id, text: `  ${id}\n` });
    assert.equal(result.ok, true);
    state = result.state;
  }
  return state;
}

test("queued messages are trimmed and taken in the order they were added", () => {
  const state = addThree();
  assert.deepEqual(previewRows(state, thread).map((row) => row.id), ["first", "second", "third"]);
  assert.equal(previewRows(state, thread)[1].label, "Queued message 2 of 3");

  const next = takeNext(state, thread);
  assert.equal(next.message?.id, "first");
  assert.equal(next.message?.text, "first");
  assert.deepEqual(previewRows(next.state, thread).map((row) => row.id), ["second", "third"]);
  assert.equal(previewRows(next.state, thread)[0].label, "Queued message 1 of 2");
  assert.equal(takeNext(empty, thread).message, undefined);
});

test("empty and whitespace-only messages are refused", () => {
  const state = addThree();
  for (const text of ["", "  ", "\t\n"]) {
    const result = addQueued(state, thread, { id: "blank", text });
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, state);
  }
});

test("a sixth message is refused with an explanation and the existing five stay queued", () => {
  let state = empty;
  for (const id of ["one", "two", "three", "four", "five"]) {
    const result = addQueued(state, thread, { id, text: id });
    assert.equal(result.ok, true);
    state = result.state;
  }

  const result = addQueued(state, thread, { id: "six", text: "Another follow-up" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /5 queued messages/i);
  assert.deepEqual(result.state, state);
  assert.equal(previewRows(result.state, thread).length, 5);
  assert.equal(addQueued(state, "thread-b", { id: "six", text: "Other thread" }).ok, true);
});

test("editing preserves queue position and removing affects only the selected id", () => {
  const state = addThree();
  const edited = replaceQueued(state, thread, "second", "  revised  ");
  assert.deepEqual(previewRows(edited, thread).map((row) => [row.id, row.text]), [
    ["first", "first"], ["second", "revised"], ["third", "third"],
  ]);
  const removed = removeQueued(edited, thread, "first");
  assert.equal(takeNext(removed, thread).message?.text, "revised");
  assert.deepEqual(removeQueued(edited, thread, "missing"), edited);
  assert.deepEqual(replaceQueued(edited, thread, "missing", "ignored"), edited);
  assert.deepEqual(replaceQueued(edited, thread, "second", " \n "), edited);
});

test("a long preview includes the ellipsis in its 80-character limit", () => {
  const long = addQueued(empty, thread, { id: "long", text: "x".repeat(300) }).state;
  assert.equal(previewRows(long, thread)[0].text, `${"x".repeat(79)}…`);
  const exact = addQueued(empty, thread, { id: "exact", text: "x".repeat(80) }).state;
  assert.equal(previewRows(exact, thread)[0].text, "x".repeat(80));
});

test("Hebrew previews keep the letter and its niqqud together and follow the first letter", () => {
  const letter = "שָׁ";
  const prefix = `123 ${"א".repeat(74)}${letter}`;
  const hebrew = addQueued(empty, thread, { id: "hebrew", text: `${prefix}${letter}ב` }).state;
  assert.equal(previewRows(hebrew, thread)[0].text, `${prefix}…`);
  assert.equal(previewRows(hebrew, thread)[0].direction, "rtl");

  const mixed = addQueued(empty, thread, { id: "mixed", text: "Hello שָׁלוֹם" }).state;
  assert.equal(previewRows(mixed, thread)[0].direction, "ltr");
});

test("preview clipping preserves a joined emoji and a pair of regional indicators", () => {
  const prefix = "a".repeat(78);
  const state = addQueued(empty, thread, { id: "emoji", text: `${prefix}👩🏽‍💻🇮🇱z` }).state;
  assert.equal(previewRows(state, thread)[0].text, `${prefix}👩🏽‍💻…`);
  const flag = addQueued(empty, thread, { id: "flag", text: `${prefix}🇮🇱ab` }).state;
  assert.equal(previewRows(flag, thread)[0].text, `${prefix}🇮🇱…`);
});

test("previews collapse whitespace and count attachments while the queued message keeps them", () => {
  const attachments = [{ id: "attachment-1" }, { id: "attachment-2" }];
  const result = addQueued(empty, thread, { id: "follow-up", text: "  One\r\n\n two   \t three  ", attachments });
  assert.deepEqual(previewRows(result.state, thread), [{
    id: "follow-up",
    text: "One two three",
    direction: "ltr",
    attachmentCount: 2,
    label: "Queued message 1 of 1",
  }]);
  const edited = replaceQueued(result.state, thread, "follow-up", "  Four\n five  ");
  assert.deepEqual(takeNext(edited, thread).message, { id: "follow-up", text: "Four\n five", attachments });
  assert.equal(takeNext(result.state, thread).message?.text, "One\r\n\n two   \t three");
});

test("each thread has its own preview, edits and next message", () => {
  const first = addThree();
  assert.deepEqual(previewRows(first, "thread-b"), []);
  assert.deepEqual(previewRows(first, "constructor"), []);

  const both = addQueued(first, "thread-b", { id: "first", text: "Other thread" }).state;
  const next = takeNext(both, "thread-b");
  assert.equal(next.message?.text, "Other thread");
  assert.deepEqual(previewRows(next.state, thread), previewRows(first, thread));
  assert.deepEqual(previewRows(next.state, "thread-b"), []);
});

test("operations on deeply frozen state return new state and preserve the input", () => {
  const first = Object.freeze({ id: "first", text: "Original", attachments: Object.freeze([Object.freeze({ id: "attachment" })]) });
  const state: QueuedPreviewState = Object.freeze({ queues: Object.freeze({ [thread]: Object.freeze([first]) }) });
  const draft = Object.freeze({ id: "second", text: "  Second  " });
  assert.notStrictEqual(addQueued(state, thread, draft).state, state);
  assert.notStrictEqual(replaceQueued(state, thread, "first", "Edited"), state);
  assert.notStrictEqual(removeQueued(state, thread, "first"), state);
  assert.notStrictEqual(takeNext(state, thread).state, state);
  assert.equal(previewRows(state, thread)[0].text, "Original");
  assert.equal(draft.text, "  Second  ");
});
