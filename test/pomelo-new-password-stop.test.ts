import assert from "node:assert/strict";
import test from "node:test";
import { newPasswordStop } from "../src/pomelo/browser/new-password-stop.js";
import { MASK } from "../src/pomelo/mask.js";

const page = { title: "Sign in", text: "Welcome back", fields: [] };
const currentPassword = { type: "password", autocomplete: "current-password", label: "Password", value: MASK };

function expectHold(read: unknown, signal: string) {
  const result = newPasswordStop(read);
  assert.equal(result.action, "hold");
  assert.ok(result.signals.includes(signal));
  return result;
}

test("holds on the new-password autocomplete token before considering wording", () => {
  const result = expectHold({
    ...page,
    title: "Create a password",
    fields: [{ type: "text", autocomplete: "section-account NEW-PASSWORD", label: "Password" }],
  }, "new-password-autocomplete");
  assert.deepEqual(result.signals, ["new-password-autocomplete"]);
});

test("holds for two password fields in the same form", () => {
  const fields = [{ type: "password", label: "Enter password" }, { type: "password", label: "Repeat password" }];
  expectHold({ ...page, fields }, "multiple-password-fields");
  expectHold({ ...page, fields: fields.map((field) => ({ ...field, formId: "account" })) }, "multiple-password-fields");
});

test("continues when two sign-in forms each have only one password field", () => {
  const fields = ["primary", "alternate"].map((formId) => ({ ...currentPassword, formId }));
  assert.equal(newPasswordStop({ ...page, fields }).action, "go");
});

for (const prompt of [
  "Your password has expired.",
  "Choose a new password",
  "Create a password",
  "You must change your password to continue.",
  "Confirm new password",
  "יש לבחור סיסמה חדשה כדי להמשיך",
]) {
  test(`holds for ${JSON.stringify(prompt)} in the page wording`, () => {
    expectHold({ ...page, text: prompt }, "new-password-wording");
  });
}

test("holds when the prompt is in the title or the field label", () => {
  expectHold({ ...page, title: "Choose a new password" }, "new-password-wording");
  expectHold({ ...page, fields: [{ type: "password", label: "New password" }] }, "new-password-wording");
});

test("continues for an ordinary sign-in form with a masked current-password field", () => {
  const result = newPasswordStop({ ...page, fields: [currentPassword] });
  assert.equal(result.action, "go");
  assert.deepEqual(result.signals, []);
});

test("continues for a sign-up marketing page that only mentions passwords", () => {
  assert.equal(newPasswordStop({ ...page, title: "Sign up", text: "Keep your password safe with our app." }).action, "go");
});

test("holds even when the page offers to skip or defer the password change", () => {
  const result = expectHold({
    ...page,
    text: "Choose a new password\nSkip for now\nRemind me later",
    items: ['[1] button "Skip for now"', '[2] button "Remind me later"'],
  }, "new-password-wording");
  assert.match(result.reason, /Amit decides/i);
});

test("the result never contains a field value and the rule never reads the value slot", () => {
  const canary = "POMELO_NEW_PASSWORD_TEST_CANARY";
  const field = { type: "password", autocomplete: "new-password", label: "Password" };
  const result = expectHold({ ...page, fields: [{ ...field, value: canary }] }, "new-password-autocomplete");
  assert.doesNotMatch(JSON.stringify(result), /POMELO_NEW_PASSWORD_TEST_CANARY/);

  const guarded = Object.defineProperty({ ...field }, "value", {
    get() { assert.fail("the new-password rule read the field value"); },
  });
  expectHold({ ...page, fields: [guarded] }, "new-password-autocomplete");
});

test("mask markers provide no wording or field evidence", () => {
  const result = expectHold({ title: MASK, text: "[secret hidden]", fields: [] }, "unreadable-page");
  assert.doesNotMatch(JSON.stringify(result), /••••|secret hidden/);
  assert.equal(newPasswordStop({ ...page, fields: [{ type: MASK, autocomplete: MASK, label: MASK }] }).action, "go");
});

test("empty and malformed reads hold with a plain reason", () => {
  for (const read of [undefined, null, [], {}, { title: " ", text: "", fields: [] },
    { ...page, text: 42 }, { ...page, fields: "password" }, { ...page, fields: [null] },
    { ...page, fields: [{ type: false }] }]) {
    const result = expectHold(read, "unreadable-page");
    assert.match(result.reason, /page read is empty or invalid/i);
  }
});
