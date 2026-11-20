import assert from "node:assert/strict";
import test from "node:test";
import { blur, pressKey, startEdit, typeText } from "../src/client/pomelo/title-edit.js";

const enter = { key: "Enter", isComposing: false };
const escape = { key: "Escape", isComposing: false };

test("Enter saves the trimmed draft and ends editing", () => {
  const started = startEdit("Old title");
  assert.equal(started.effect, undefined);
  assert.equal(started.state.editing, true);
  assert.equal(started.state.text, "Old title");
  const changed = typeText(started.state, "  New title \t");
  assert.equal(changed.effect, undefined);
  assert.equal(changed.state.text, "  New title \t");
  assert.equal(started.state.text, "Old title");
  assert.deepEqual(pressKey(changed.state, enter), {
    state: { editing: false, text: "New title", dir: "ltr" },
    effect: { save: "New title" },
  });
});

test("Enter and Escape during composition leave the Hebrew draft alone", () => {
  const { state } = typeText(startEdit("Old title").state, "של");
  for (const event of [enter, escape]) {
    const result = pressKey(state, { ...event, isComposing: true });
    assert.equal(result.state, state);
    assert.equal(result.state.editing, true);
    assert.equal(result.effect, undefined);
  }
  assert.deepEqual(pressKey(typeText(state, "שלום").state, enter).effect, { save: "שלום" });
});

test("other keys leave editing to the input", () => {
  const { state } = startEdit("Old title");
  const result = pressKey(state, { key: "ArrowLeft", isComposing: false });
  assert.equal(result.state, state);
  assert.equal(result.effect, undefined);
});

test("Escape restores the exact original title and direction", () => {
  const { state } = typeText(startEdit("  שלום  ").state, "New title");
  assert.deepEqual(pressKey(state, escape), {
    state: { editing: false, text: "  שלום  ", dir: "rtl" },
    effect: { cancel: true },
  });
});

test("Enter cancels an unchanged, empty, or whitespace-only title", () => {
  const { state } = startEdit("Old title");
  for (const text of ["Old title", " Old title ", "", " \t\n "]) {
    assert.deepEqual(pressKey(typeText(state, text).state, enter), {
      state: { editing: false, text: "Old title", dir: "ltr" },
      effect: { cancel: true },
    });
  }
});

test("blur follows the same save and cancel rules as Enter", () => {
  const { state } = startEdit("Old title");
  const changed = typeText(state, "  שלום  ").state;
  assert.deepEqual(blur(changed), {
    state: { editing: false, text: "שלום", dir: "rtl" },
    effect: { save: "שלום" },
  });
  for (const text of ["Old title", "  "]) {
    assert.deepEqual(blur(typeText(state, text).state), {
      state: { editing: false, text: "Old title", dir: "ltr" },
      effect: { cancel: true },
    });
  }
});

test("drafts stop at 80 whole graphemes, including Hebrew marks and joined emoji", () => {
  const { state } = startEdit("Old title");
  const hebrew = "שָׁ".repeat(80);
  const prefix = "א".repeat(79);
  const emoji = "👩‍💻";
  assert.equal(typeText(state, hebrew).state.text, hebrew);
  assert.equal(typeText(state, hebrew + "ב").state.text, hebrew);
  const capped = typeText(state, prefix + emoji + emoji).state;
  assert.equal(capped.text, prefix + emoji);
  assert.deepEqual(pressKey(capped, enter).effect, { save: prefix + emoji });
});

test("opening a legacy long title and leaving it alone preserves it", () => {
  const title = "א".repeat(81);
  const { state } = startEdit(title);
  assert.deepEqual(blur(state), {
    state: { editing: false, text: title, dir: "rtl" },
    effect: { cancel: true },
  });
});

test("the first strong character determines direction for original and typed titles", () => {
  const { state } = startEdit("Old title");
  const titles = [
    ["שלום", "rtl"],
    ["Hello", "ltr"],
    ["123", "auto"],
    ["...", "auto"],
    ["👋 123 שָׁלוֹם Hello", "rtl"],
    ["! 123 Hello שלום", "ltr"],
    ["مرحبا Hello", "rtl"],
    ["世界 שלום", "ltr"],
    ["`Hello` שלום", "ltr"],
    ["١٢٣", "auto"],
    ["\u05B0Hello", "ltr"],
    ["\u05BEHello", "rtl"],
    ["\u200Eשלום", "ltr"],
  ] as const;
  for (const [title, dir] of titles) {
    assert.equal(startEdit(title).state.dir, dir, title);
    assert.equal(typeText(state, title).state.dir, dir, title);
  }
});

test("events after editing ends keep the same state and emit no effect", () => {
  const { state } = typeText(startEdit("Old title").state, "New title");
  const finished = pressKey(state, enter).state;
  for (const result of [typeText(finished, "Another title"), pressKey(finished, enter), pressKey(finished, escape), blur(finished)]) {
    assert.equal(result.state, finished);
    assert.equal(result.effect, undefined);
  }
});
