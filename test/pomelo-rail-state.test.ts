import { test } from "node:test";
import assert from "node:assert/strict";
import { railState, type RailStateInput } from "../src/client/pomelo/rail-state.js";

const now = 14_400_000;

function view(input: Partial<RailStateInput> = {}) {
  return railState({ loaded: false, loading: false, failed: false, rowCount: 0, now, ...input });
}

test("the first load shows a placeholder before and during the fetch", () => {
  const expected = { kind: "first-load", showRows: false, canRetry: false };
  assert.deepEqual(view(), expected);
  assert.deepEqual(view({ loading: true }), expected);
});

test("a successful fetch with no threads shows the empty note", () => {
  assert.deepEqual(view({ loaded: true }), {
    kind: "empty",
    showRows: false,
    note: "No threads yet. Start one below.",
    canRetry: false,
  });
});

test("a successful fetch with threads shows the rows", () => {
  assert.deepEqual(view({ loaded: true, rowCount: 2 }), {
    kind: "ready",
    showRows: true,
    canRetry: false,
  });
});

test("refreshing keeps rows visible without a note even after a previous failure", () => {
  const expected = { kind: "refreshing", showRows: true, canRetry: false };
  assert.deepEqual(view({ loaded: true, loading: true, rowCount: 2 }), expected);
  assert.deepEqual(view({ loaded: true, loading: true, failed: true, rowCount: 2 }), expected);
});

test("a failed refresh keeps rows and offers a retry with the age of the last good fetch", () => {
  for (const [age, label] of [[20_000, "just now"], [300_000, "5 min ago"], [10_800_000, "3 h ago"]] as const) {
    assert.deepEqual(view({ loaded: true, failed: true, rowCount: 2, lastGoodAt: now - age }), {
      kind: "stale",
      showRows: true,
      note: `Could not refresh. Showing threads from ${label}.`,
      canRetry: true,
    });
  }
});

test("a failed refresh with an unavailable timestamp says earlier", () => {
  for (const lastGoodAt of [undefined, now + 1, NaN, Infinity]) {
    const state = view({ loaded: true, failed: true, rowCount: 2, lastGoodAt });
    assert.equal(state.note, "Could not refresh. Showing threads from earlier.");
  }
});

test("a failed fetch with no rows shows the load error and offers a retry", () => {
  for (const loaded of [false, true]) {
    assert.deepEqual(view({ loaded, failed: true }), {
      kind: "failed",
      showRows: false,
      note: "Could not load threads.",
      canRetry: true,
    });
  }
});

test("zero and invalid row counts never show rows", () => {
  const empty = view({ loaded: true });
  for (const rowCount of [0, NaN, -1, Infinity]) {
    assert.deepEqual(view({ loaded: true, rowCount }), empty);
    for (const loaded of [false, true]) {
      for (const loading of [false, true]) {
        for (const failed of [false, true]) {
          assert.equal(view({ loaded, loading, failed, rowCount }).showRows, false);
        }
      }
    }
  }
});

test("rail notes stay within 80 characters even with a very old last good fetch", () => {
  const empty = view({ loaded: true });
  const failed = view({ failed: true });
  const stale = view({ loaded: true, failed: true, rowCount: 2, lastGoodAt: 0, now: Number.MAX_VALUE });
  for (const { note } of [empty, failed, stale]) {
    assert.ok(note && note.length <= 80);
  }
});
