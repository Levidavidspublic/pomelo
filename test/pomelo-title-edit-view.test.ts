import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloTitleEdit, titleEditStep, titleEditView } from "../src/client/pomelo/PomeloTitleEdit.js";
import { startEdit } from "../src/client/pomelo/title-edit.js";

const enter = { type: "key", key: "Enter", isComposing: false } as const;
const escape = { type: "key", key: "Escape", isComposing: false } as const;

function render(title: string, initialEditing?: boolean) {
  return renderToStaticMarkup(createElement(PomeloTitleEdit, {
    title,
    initialEditing,
    onSave: () => assert.fail("Rendering must not save a title"),
  }));
}

test("at rest the title is a heading beside a named rename button", () => {
  const { state } = titleEditStep(startEdit("Project notes").state, escape);
  assert.deepEqual(titleEditView(state), {
    mode: "rest", text: "Project notes", dir: "ltr", buttonLabel: "Rename thread",
  });
  const html = render("Project notes");
  assert.match(html, /<h1\b[^>]*dir="ltr"[^>]*>Project notes<\/h1>/);
  assert.match(html, /<button\b[^>]*type="button"[^>]*>Rename thread<\/button>/);
  assert.doesNotMatch(html, /<input\b|\bautofocus\b/i);
});

test("initial editing renders one labelled text box with the Hebrew title and model direction", () => {
  const title = "שלום notes";
  assert.deepEqual(titleEditView(startEdit(title).state), {
    mode: "editing", text: title, dir: "rtl", inputLabel: "Thread title",
  });
  assert.match(render(title), /<h1\b[^>]*dir="rtl"[^>]*>שלום notes<\/h1>/);
  const html = render(title, true);
  const inputs = html.match(/<input\b[^>]*>/g) ?? [];
  assert.equal(inputs.length, 1);
  assert.match(inputs[0], /type="text"/);
  assert.match(inputs[0], /aria-label="Thread title"/);
  assert.match(inputs[0], /dir="rtl"/);
  assert.match(inputs[0], /value="שלום notes"/);
  assert.doesNotMatch(html, /<h1\b|<button\b|\bautofocus\b/i);
});

test("blank titles show the thread fallback at rest and stay blank in the editor", () => {
  for (const title of ["", " \t "]) {
    const { state } = titleEditStep(startEdit(title).state, escape);
    assert.equal(titleEditView(state).text, "New thread");
    assert.match(render(title), /<h1\b[^>]*>New thread<\/h1>/);
  }
  assert.match(render("", true), /<input\b[^>]*value=""/);
});

test("text changes update direction, Enter saves once, and subsequent blur has no effect", () => {
  const started = startEdit("Project notes").state;
  const changed = titleEditStep(started, { type: "text", text: "  שלום  " });
  assert.equal(changed.effect, undefined);
  assert.equal(titleEditView(changed.state).dir, "rtl");
  assert.equal(titleEditView(changed.state).text, "  שלום  ");

  const saved = titleEditStep(changed.state, enter);
  assert.deepEqual(saved.effect, { save: "שלום" });
  assert.deepEqual(titleEditView(saved.state), {
    mode: "rest", text: "שלום", dir: "rtl", buttonLabel: "Rename thread",
  });
  assert.deepEqual(titleEditStep(saved.state, { type: "blur" }), { state: saved.state });
});

test("Escape restores the original title and blur saves a changed draft", () => {
  const started = startEdit("שלום").state;
  const { state } = titleEditStep(started, { type: "text", text: "Revised notes" });
  const cancelled = titleEditStep(state, escape);
  assert.deepEqual(cancelled.effect, { cancel: true });
  assert.deepEqual(titleEditView(cancelled.state), {
    mode: "rest", text: "שלום", dir: "rtl", buttonLabel: "Rename thread",
  });
  assert.deepEqual(titleEditStep(cancelled.state, { type: "blur" }), { state: cancelled.state });
  assert.deepEqual(titleEditStep(state, { type: "blur" }).effect, { save: "Revised notes" });
});

test("Enter and Escape during Hebrew composition leave the draft in editing mode", () => {
  const started = startEdit("Project notes").state;
  const { state } = titleEditStep(started, { type: "text", text: "של" });
  for (const event of [enter, escape]) {
    const composing = titleEditStep(state, { ...event, isComposing: true });
    assert.equal(composing.state, state);
    assert.equal(composing.effect, undefined);
  }
});
