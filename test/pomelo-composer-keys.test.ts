import assert from "node:assert/strict";
import test from "node:test";
import { composerKeyAction } from "../src/client/pomelo/composer-keys.js";

const enter = {
  key: "Enter",
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
};
const ready = { text: "Hello", sending: false, narrow: false, menuOpen: false };

test("Enter sends a message on a wide layout", () => {
  assert.deepEqual(composerKeyAction(enter, ready), { action: "send", reason: "enter" });
});

test("Shift+Enter inserts a newline even in an empty draft", () => {
  const result = composerKeyAction({ ...enter, shiftKey: true }, { ...ready, text: "" });
  assert.deepEqual(result, { action: "newline", reason: "shift-enter" });
});

test("Ctrl+Enter sends a message", () => {
  assert.equal(composerKeyAction({ ...enter, ctrlKey: true }, ready).action, "send");
});

test("Cmd+Enter sends a message", () => {
  assert.equal(composerKeyAction({ ...enter, metaKey: true }, ready).action, "send");
});

test("Enter during composition is left to the input method", () => {
  const event = { ...enter, isComposing: true };
  const state = { ...ready, text: "של" };
  assert.deepEqual(composerKeyAction(event, state), { action: "none", reason: "composing" });
  assert.equal(composerKeyAction({ ...event, ctrlKey: true }, state).action, "none");
});

test("keyCode 229 guards Enter even when isComposing is false", () => {
  const event = { ...enter, keyCode: 229 };
  assert.deepEqual(composerKeyAction(event, ready), { action: "none", reason: "composing" });
  assert.equal(composerKeyAction({ ...event, metaKey: true }, ready).action, "none");
});

test("Enter does nothing for empty text", () => {
  assert.deepEqual(composerKeyAction(enter, { ...ready, text: "" }), { action: "none", reason: "blank" });
});

test("Enter does nothing for whitespace-only text", () => {
  assert.equal(composerKeyAction(enter, { ...ready, text: " \t\n " }).action, "none");
});

test("Enter does nothing for a draft made entirely of spaces", () => {
  assert.equal(composerKeyAction(enter, { ...ready, text: "   " }).action, "none");
});

test("Enter does nothing while a send is in progress", () => {
  const state = { ...ready, sending: true };
  assert.deepEqual(composerKeyAction(enter, state), { action: "none", reason: "sending" });
  assert.equal(composerKeyAction({ ...enter, metaKey: true }, state).action, "none");
});

test("Enter belongs to the open mention or command menu", () => {
  assert.deepEqual(composerKeyAction(enter, { ...ready, menuOpen: true }), {
    action: "none", reason: "menu-open",
  });
  const result = composerKeyAction({ ...enter, ctrlKey: true }, { ...ready, menuOpen: true, narrow: true });
  assert.deepEqual(result, { action: "none", reason: "menu-open" });
});

test("Enter inserts a newline on narrow layouts, including with send modifiers", () => {
  const state = { ...ready, narrow: true };
  assert.deepEqual(composerKeyAction(enter, state), { action: "newline", reason: "narrow" });
  assert.equal(composerKeyAction({ ...enter, ctrlKey: true }, state).action, "newline");
  assert.equal(composerKeyAction({ ...enter, metaKey: true }, state).action, "newline");
});

test("Other keys have no composer action", () => {
  assert.deepEqual(composerKeyAction({ ...enter, key: "a" }, ready), { action: "none", reason: "not-enter" });
});

test("Alt+Enter inserts a newline", () => {
  const event = { ...enter, altKey: true };
  assert.deepEqual(composerKeyAction(event, ready), { action: "newline", reason: "alt-enter" });
});

test("Enter sends a Hebrew-only message", () => {
  assert.equal(composerKeyAction(enter, { ...ready, text: "שלום" }).action, "send");
});
