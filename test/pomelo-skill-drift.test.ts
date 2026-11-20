import assert from "node:assert/strict";
import test from "node:test";
import { checkSkillStep } from "../src/pomelo/browser/skill-drift.js";

const origin = "https://a.example";
const button = { role: "button", name: "Continue" };
const link = { role: "link", name: "Continue" };
const password = { role: "textbox", name: "Password", fieldKind: "password" };
const click = { kind: "click", origin, target: button };
const fill = { kind: "fill", origin, target: password, refId: "login" };
const canary = "synthetic-drift-canary";

test("one matching button goes at its index in the current page read", () => {
  assert.deepEqual(checkSkillStep(click, {
    origin: "https://A.example:443",
    elements: [link, { ...button, name: "  cOnTiNuE " }],
  }), { verdict: "go", targetIndex: 1 });
});

test("a new host, scheme or port holds the step", () => {
  for (const otherOrigin of ["https://b.example", "http://a.example", "https://a.example:8443"]) {
    assert.deepEqual(checkSkillStep(click, { origin: otherOrigin, elements: [button] }),
      { verdict: "hold", reason: "origin-changed" });
  }
});

test("a missing or renamed target holds even when only one candidate has the right role", () => {
  for (const elements of [[], [link], [{ ...button, name: "Proceed" }]]) {
    assert.deepEqual(checkSkillStep(click, { origin, elements }),
      { verdict: "hold", reason: "target-missing" });
  }
});

test("equally good matches hold the step", () => {
  assert.deepEqual(checkSkillStep(click, { origin, elements: [button, link, { ...button, name: " continue " }] }),
    { verdict: "hold", reason: "target-unclear" });
});

test("accessible names keep Hebrew letters and marks intact", () => {
  const target = { ...button, name: "שָׁלוֹם" };
  assert.deepEqual(checkSkillStep({ ...click, target }, {
    origin,
    elements: [{ ...button, name: "שלום" }, target],
  }), { verdict: "go", targetIndex: 1 });
});

test("a fill requires the recorded field kind", () => {
  const textField = { ...password, fieldKind: "text" };
  assert.deepEqual(checkSkillStep(fill, { origin, elements: [textField] }),
    { verdict: "refuse", reason: "field-kind-changed" });
  assert.deepEqual(checkSkillStep(fill, { origin, elements: [textField, password] }),
    { verdict: "go", targetIndex: 1 });
  assert.deepEqual(checkSkillStep(fill, { origin, elements: [password, password] }),
    { verdict: "hold", reason: "target-unclear" });
});

test("type, select and targeted wait match the recorded field kind", () => {
  const field = { role: "combobox", name: "Language", fieldKind: "select" };
  const changedField = { ...field, fieldKind: "text" };
  for (const kind of ["type", "select", "wait"]) {
    const step = { kind, origin, target: field };
    assert.deepEqual(checkSkillStep(step, { origin, elements: [changedField] }),
      { verdict: "hold", reason: "target-missing" });
    assert.deepEqual(checkSkillStep(step, { origin, elements: [changedField, field] }),
      { verdict: "go", targetIndex: 1 });
  }
});

test("a fill does not fall back to its old position", () => {
  const textField = { ...password, name: "New password" };
  assert.deepEqual(checkSkillStep({ ...fill, targetIndex: 0 }, { origin, elements: [textField] }),
    { verdict: "hold", reason: "target-missing" });
  assert.deepEqual(checkSkillStep({ ...fill, target: undefined, targetIndex: 0 }, { origin, elements: [password] }),
    { verdict: "hold", reason: "target-missing" });
});

test("a step carrying a literal is refused even when it has a reference", () => {
  const page = { origin, elements: [password] };
  for (const step of [
    { ...fill, text: canary },
    { ...fill, value: canary, refId: undefined },
    { ...fill, text: "" },
    { ...fill, kind: "type", text: canary },
  ]) {
    assert.deepEqual(checkSkillStep(step, page), { verdict: "refuse", reason: "literal-value" });
  }
});

test("navigate and targetless wait check the origin without an element", () => {
  for (const kind of ["navigate", "open", "wait"]) {
    assert.deepEqual(checkSkillStep({ kind, origin }, { origin, elements: [] }),
      { verdict: "go", targetIndex: null });
    assert.deepEqual(checkSkillStep({ kind, origin }, { origin: "https://b.example", elements: [] }),
      { verdict: "hold", reason: "origin-changed" });
  }
});

test("serialized verdicts contain no page text, typed value or vault path", () => {
  const target = { ...button, name: canary };
  const step = { ...click, target };
  const vaultPath = `op://fixture/item/${canary}`;
  const results = [
    checkSkillStep(step, { origin, elements: [target] }),
    checkSkillStep(step, { origin, elements: [{ ...target, name: vaultPath }] }),
    checkSkillStep(step, { origin, elements: [target, target] }),
    checkSkillStep({ ...step, text: vaultPath }, { origin, elements: [target] }),
    checkSkillStep({ ...step, origin: vaultPath }, { origin, elements: [target] }),
  ];
  for (const result of results) {
    assert.equal(JSON.stringify(result).includes(canary), false);
    assert.equal(JSON.stringify(result).includes("op://"), false);
  }
});

test("malformed input is refused without throwing", () => {
  const page = { origin, elements: [button] };
  const badInput = { verdict: "refuse", reason: "bad-input" };
  for (const step of [null, [], { ...click, kind: "unknown" }, { ...click, origin: "about:blank" },
    { ...click, target: { ...button, name: 1 } }]) {
    assert.deepEqual(checkSkillStep(step, page), badInput);
  }
  for (const pageNow of [null, { ...page, origin: "a.example" }, { ...page, elements: {} },
    { ...page, elements: [button, null] }, { ...page, elements: Array(1) }]) {
    assert.deepEqual(checkSkillStep(click, pageNow), badInput);
  }
  assert.deepEqual(checkSkillStep(click, { ...page, get origin(): string { throw new Error(canary); } }), badInput);
});
