import assert from "node:assert/strict";
import test from "node:test";
import { railKey, type RailItem } from "../src/client/pomelo/rail-keys.js";

const items: readonly RailItem[] = [
  { id: "build", type: "group", folded: true },
  { id: "compile", type: "thread", groupId: "build" },
  { id: "docs", type: "group", folded: false },
  { id: "outline", type: "thread", groupId: "docs" },
  { id: "draft", type: "thread", groupId: "docs" },
];

test("ArrowDown advances to the next visible item and stops at the end", () => {
  assert.deepEqual(railKey(items, "build", "ArrowDown"), { focus: "docs", action: null });
  assert.deepEqual(railKey(items, "docs", "ArrowDown"), { focus: "outline", action: null });
  assert.deepEqual(railKey(items, "draft", "ArrowDown"), { focus: "draft", action: null });
});

test("ArrowUp moves to the previous visible item and stops at the start", () => {
  assert.deepEqual(railKey(items, "draft", "ArrowUp"), { focus: "outline", action: null });
  assert.deepEqual(railKey(items, "docs", "ArrowUp"), { focus: "build", action: null });
  assert.deepEqual(railKey(items, "build", "ArrowUp"), { focus: "build", action: null });
});

test("Home focuses the first visible item", () => {
  assert.deepEqual(railKey(items, "draft", "Home"), { focus: "build", action: null });
});

test("End focuses the last visible item", () => {
  const rail: readonly RailItem[] = [
    ...items,
    { id: "review", type: "group", folded: true },
    { id: "feedback", type: "thread", groupId: "review" },
  ];
  assert.deepEqual(railKey(rail, "build", "End"), { focus: "review", action: null });
});

test("ArrowLeft folds an unfolded group and keeps focus on its header", () => {
  assert.deepEqual(railKey(items, "docs", "ArrowLeft"), {
    focus: "docs", action: { type: "fold", groupId: "docs" },
  });
});

test("ArrowLeft keeps a folded group focused", () => {
  assert.deepEqual(railKey(items, "build", "ArrowLeft"), { focus: "build", action: null });
});

test("ArrowLeft on a thread focuses its group header", () => {
  assert.deepEqual(railKey(items, "draft", "ArrowLeft"), { focus: "docs", action: null });
});

test("ArrowRight unfolds a folded group and keeps focus on its header", () => {
  assert.deepEqual(railKey(items, "build", "ArrowRight"), {
    focus: "build", action: { type: "unfold", groupId: "build" },
  });
});

test("ArrowRight on an unfolded group focuses its first thread", () => {
  assert.deepEqual(railKey(items, "docs", "ArrowRight"), { focus: "outline", action: null });
});

test("ArrowRight keeps an empty unfolded group focused", () => {
  const rail: readonly RailItem[] = [{ id: "empty", type: "group", folded: false }, ...items];
  assert.deepEqual(railKey(rail, "empty", "ArrowRight"), { focus: "empty", action: null });
});

test("ArrowRight keeps a thread focused", () => {
  assert.deepEqual(railKey(items, "outline", "ArrowRight"), { focus: "outline", action: null });
});

for (const [key, label] of [["Enter", "Enter"], [" ", "Space"]]) {
  test(`${label} on a thread opens it`, () => {
    assert.deepEqual(railKey(items, "outline", key), {
      focus: "outline", action: { type: "open", threadId: "outline" },
    });
  });

  test(`${label} on a group toggles its fold`, () => {
    assert.deepEqual(railKey(items, "build", key), {
      focus: "build", action: { type: "unfold", groupId: "build" },
    });
    assert.deepEqual(railKey(items, "docs", key), {
      focus: "docs", action: { type: "fold", groupId: "docs" },
    });
  });
}

test("an unhandled key keeps valid focus and takes no action", () => {
  assert.deepEqual(railKey(items, "outline", "Tab"), { focus: "outline", action: null });
});

const movementKeys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
const keys = [...movementKeys, "Enter", " ", "Tab"];

test("every movement key starts at the first visible item when focus is absent or unknown", () => {
  for (const key of movementKeys) {
    assert.deepEqual(railKey(items, null, key), { focus: "build", action: null }, key);
    assert.deepEqual(railKey(items, "removed", key), { focus: "build", action: null }, key);
  }
});

test("other keys with absent or unknown focus leave the rail without focus", () => {
  for (const key of ["Enter", " ", "Tab"]) {
    assert.deepEqual(railKey(items, null, key), { focus: null, action: null }, key);
    assert.deepEqual(railKey(items, "removed", key), { focus: null, action: null }, key);
  }
});

test("an empty rail returns no focus or action", () => {
  for (const key of keys) {
    assert.deepEqual(railKey([], "removed", key), { focus: null, action: null }, key);
  }
});

test("focus on a hidden thread returns to its folded group header", () => {
  for (const key of keys) {
    assert.deepEqual(railKey(items, "compile", key), { focus: "build", action: null }, key);
  }
});

test("every returned focus id belongs to a visible rail item", () => {
  const visibleIds = ["build", "docs", "outline", "draft"];
  for (const focusId of [null, "removed", ...items.map(({ id }) => id)]) {
    for (const key of keys) {
      const { focus } = railKey(items, focusId, key);
      assert.ok(focus === null || visibleIds.includes(focus), `${key} from ${focusId} returned ${focus}`);
    }
  }
});
