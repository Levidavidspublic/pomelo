import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyScrollState, fromJSON, rememberScroll, restoreScroll, toJSON } from "../src/client/pomelo/thread-scroll.js";

const reading = Object.freeze({ anchorMessageId: "m2", offsetPx: 24.5, atBottom: false });
const messages = Object.freeze(["m1", "m2", "m3"]);

test("an unknown thread opens at the newest message", () => {
  assert.deepEqual(restoreScroll(emptyScrollState(), "thread-a", messages), { mode: "bottom" });
});

test("a thread left at the bottom opens at the bottom after a new message arrives", () => {
  const state = rememberScroll(emptyScrollState(), "thread-a", { ...reading, atBottom: true });
  assert.deepEqual(restoreScroll(state, "thread-a", messages), { mode: "bottom" });
});

test("a thread left mid-read restores its anchor and offset after messages arrive", () => {
  const state = rememberScroll(emptyScrollState(), "thread-a", reading);
  assert.deepEqual(restoreScroll(state, "thread-a", messages), { mode: "anchor", messageId: "m2", offsetPx: 24.5 });
});

test("a removed anchor falls back to the bottom", () => {
  const state = rememberScroll(emptyScrollState(), "thread-a", reading);
  assert.deepEqual(restoreScroll(state, "thread-a", ["m1", "m3"]), { mode: "bottom" });
});

test("an empty thread opens at the top even with a saved position", () => {
  const state = rememberScroll(emptyScrollState(), "thread-a", reading);
  assert.deepEqual(restoreScroll(state, "thread-a", []), { mode: "top" });
  assert.deepEqual(restoreScroll(state, "thread-b", []), { mode: "top" });
});

test("threads keep separate positions even when their message IDs overlap", () => {
  let state = rememberScroll(emptyScrollState(), "thread-a", reading);
  state = rememberScroll(state, "thread-b", { ...reading, anchorMessageId: "m1", offsetPx: 8 });
  assert.deepEqual(restoreScroll(state, "thread-a", messages), { mode: "anchor", messageId: "m2", offsetPx: 24.5 });
  assert.deepEqual(restoreScroll(state, "thread-b", messages), { mode: "anchor", messageId: "m1", offsetPx: 8 });
});

test("adding a 201st thread evicts the oldest saved position after a thread is revisited", () => {
  let state = emptyScrollState();
  for (let i = 0; i < 200; i++) state = rememberScroll(state, `thread-${i}`, reading);
  state = rememberScroll(state, "thread-0", { ...reading, offsetPx: 42 });
  assert.deepEqual(restoreScroll(state, "thread-1", messages), { mode: "anchor", messageId: "m2", offsetPx: 24.5 });

  state = rememberScroll(fromJSON(toJSON(state)), "thread-200", reading);
  assert.deepEqual(restoreScroll(state, "thread-1", messages), { mode: "bottom" });
  assert.deepEqual(restoreScroll(state, "thread-0", messages), { mode: "anchor", messageId: "m2", offsetPx: 42 });
  for (let i = 2; i <= 200; i++) assert.equal(restoreScroll(state, `thread-${i}`, messages).mode, "anchor");
});

test("the caller can supply a counter or timestamp for recency", () => {
  let state = emptyScrollState();
  for (let i = 1; i <= 200; i++) state = rememberScroll(state, `thread-${i}`, reading, i);
  state = rememberScroll(state, "thread-0", reading, 0);
  assert.deepEqual(restoreScroll(state, "thread-0", messages), { mode: "bottom" });
  assert.equal(restoreScroll(state, "thread-1", messages).mode, "anchor");
});

test("versioned JSON round-trips state and keeps only position metadata", () => {
  const position = { ...reading, messageText: "fixture text" };
  let state = rememberScroll(emptyScrollState(), "thread-a", position, 12);
  state = rememberScroll(state, "thread-b", { anchorMessageId: null, offsetPx: 0, atBottom: true }, 13);
  const json = toJSON(state);
  assert.deepEqual(fromJSON(json), state);
  assert.equal(json.includes(position.messageText), false);
  assert.deepEqual(fromJSON(toJSON(emptyScrollState())), emptyScrollState());
});

test("bad stored data returns an empty state", () => {
  const json = toJSON(rememberScroll(emptyScrollState(), "thread-a", reading));
  for (const data of [undefined, "garbage", "null", "{}", json.replace('"version":1', '"version":2'), json.replace('"atBottom":false', '"atBottom":"false"')]) {
    assert.deepEqual(fromJSON(data), emptyScrollState(), String(data));
  }
});

test("huge stored offsets are clamped", () => {
  const json = toJSON(rememberScroll(emptyScrollState(), "thread-a", reading));
  const state = fromJSON(json.replace('"offsetPx":24.5', '"offsetPx":1e100'));
  assert.deepEqual(restoreScroll(state, "thread-a", messages), { mode: "anchor", messageId: "m2", offsetPx: 1_000_000 });
});

test("negative and NaN offsets are clamped to zero", () => {
  for (const offsetPx of [-1, NaN]) {
    const state = rememberScroll(emptyScrollState(), "thread-a", { ...reading, offsetPx });
    assert.deepEqual(restoreScroll(state, "thread-a", messages), { mode: "anchor", messageId: "m2", offsetPx: 0 });
  }
});

test("saving, restoring and serializing leave their inputs unchanged", () => {
  const state = rememberScroll(emptyScrollState(), "thread-a", reading);
  for (const entry of state.entries) Object.freeze(entry);
  Object.freeze(state.entries);
  Object.freeze(state);
  const before = toJSON(state);

  const next = rememberScroll(state, "thread-a", { ...reading, offsetPx: 4 });
  assert.notStrictEqual(next, state);
  assert.deepEqual(restoreScroll(next, "thread-a", messages), { mode: "anchor", messageId: "m2", offsetPx: 4 });
  assert.deepEqual(restoreScroll(state, "thread-a", messages), { mode: "anchor", messageId: "m2", offsetPx: 24.5 });
  assert.equal(toJSON(state), before);
});
