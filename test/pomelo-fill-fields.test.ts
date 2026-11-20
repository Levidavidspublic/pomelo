import assert from "node:assert/strict";
import test from "node:test";
import { planFill, type MaskedFillField } from "../src/pomelo/broker/fill-fields.js";

const grantedFrame = "login-frame";
const field = (id: string, overrides: Partial<MaskedFillField> = {}): MaskedFillField => ({
  id, type: "text", visible: true, editable: true, frame: grantedFrame, ...overrides,
});
const username = field("account", { autocomplete: "section-login USERNAME webauthn" });
const password = field("password", { type: "password" });
const noMatch = { decision: "hold", plan: [], reason: "no_match" };
const ambiguous = { decision: "hold", plan: [], reason: "ambiguous_field" };

test("plans a plain login in requested part order without mutating the snapshot", () => {
  const fields = Object.freeze([Object.freeze(password), Object.freeze(username)]);
  const parts = Object.freeze(["username", "password"] as const);
  assert.deepEqual(planFill(fields, parts, grantedFrame), {
    decision: "fill",
    plan: [{ part: "username", fieldId: "account" }, { part: "password", fieldId: "password" }],
  });
});

test("holds an email-first login with only the username mapping for review", () => {
  const email = field("email", { type: "email", name: "emailAddress" });
  const plan = [{ part: "username", fieldId: "email" }];
  assert.deepEqual(planFill([email], ["username"], grantedFrame), { decision: "fill", plan });
  assert.deepEqual(planFill([email], ["password", "username"], grantedFrame), {
    decision: "hold", plan, reason: "no_match",
  });
});

test("holds a password request when the only field is a visible text box", () => {
  const text = field("text", { autocomplete: "current-password", label: "Password" });
  assert.deepEqual(planFill([text], ["password"], grantedFrame), noMatch);
  assert.deepEqual(planFill([{ ...text, type: " password " }], ["password"], grantedFrame), noMatch);
});

test("skips hidden and read-only password fields", () => {
  const excluded = [
    { ...password, id: "hidden", visible: false },
    { ...password, id: "readonly", editable: false },
  ];
  assert.deepEqual(planFill(excluded, ["password"], grantedFrame), noMatch);
  assert.deepEqual(planFill([...excluded, password], ["password"], grantedFrame), {
    decision: "fill", plan: [{ part: "password", fieldId: "password" }],
  });
});

test("search boxes and text areas stay ineligible even with matching hints", () => {
  for (const type of ["search", "textarea", "hidden"]) {
    const usernameHint = field("account", { type, autocomplete: "username" });
    const otpHint = field("code", { type, autocomplete: "one-time-code" });
    assert.deepEqual(planFill([usernameHint], ["username"], grantedFrame), noMatch);
    assert.deepEqual(planFill([otpHint], ["otp"], grantedFrame), noMatch);
  }
  const textSearch = field("search", { label: "Search by username", autocomplete: "username" });
  assert.deepEqual(planFill([textSearch], ["username"], grantedFrame), noMatch);
});

test("holds a change-password form with current and new password fields", () => {
  const fields = [
    { ...password, id: "current", autocomplete: "current-password" },
    { ...password, id: "new", autocomplete: "new-password" },
  ];
  assert.deepEqual(planFill(fields, ["password"], grantedFrame), ambiguous);
});

test("plans a one-time code using an autocomplete hint or a clear label", () => {
  for (const hints of [
    { type: "number", autocomplete: "section-login one-time-code" },
    { type: "tel", label: "Verification code:" },
  ]) {
    assert.deepEqual(planFill([field("code", hints)], ["otp"], grantedFrame), {
      decision: "fill", plan: [{ part: "otp", fieldId: "code" }],
    });
  }
});

test("a masked verification code input is reserved for the code", () => {
  const code = { ...password, id: "code", autocomplete: "one-time-code" };
  assert.deepEqual(planFill([code], ["password"], grantedFrame), noMatch);
  assert.deepEqual(planFill([code], ["otp"], grantedFrame), {
    decision: "fill", plan: [{ part: "otp", fieldId: "code" }],
  });
});

test("generic contact fields, promo codes and card codes have no login match", () => {
  const email = field("email", { type: "email" });
  const phone = field("phone", { type: "tel", autocomplete: "tel" });
  const conflict = field("conflict", { label: "Username", autocomplete: "current-password" });
  assert.deepEqual(planFill([email, phone, conflict], ["username"], grantedFrame), noMatch);
  const promo = field("promo", { label: "Promo code" });
  const card = field("card", { label: "Code", autocomplete: "cc-csc" });
  assert.deepEqual(planFill([promo, card], ["otp"], grantedFrame), noMatch);
});

test("only selects fields in the exact granted frame", () => {
  const foreign = { ...password, frame: "another-frame" };
  assert.deepEqual(planFill([foreign], ["password"], grantedFrame), noMatch);
  assert.deepEqual(planFill([foreign, password], ["password"], grantedFrame), {
    decision: "fill", plan: [{ part: "password", fieldId: "password" }],
  });
});

test("holds when no fields or parts are available", () => {
  assert.deepEqual(planFill([], ["username"], grantedFrame), noMatch);
  assert.deepEqual(planFill([username], [], grantedFrame), noMatch);
});

test("matches Hebrew username, email and verification labels", () => {
  const code = field("code", { label: "קוד חד־פעמי:" });
  for (const label of ["שם משתמש", "כתובת דוא״ל"]) {
    const account = field("account", { type: "tel", label });
    assert.deepEqual(planFill([account, code], ["username", "otp"], grantedFrame), {
      decision: "fill",
      plan: [{ part: "username", fieldId: "account" }, { part: "otp", fieldId: "code" }],
    });
  }
});

test("holds tied matches and duplicate field ids within the granted frame", () => {
  const secondUsername = { ...username, id: "other-account" };
  assert.deepEqual(planFill([username, secondUsername], ["username"], grantedFrame), ambiguous);
  const duplicateId = field(password.id, { type: "search" });
  assert.deepEqual(planFill([password, duplicateId], ["password"], grantedFrame), ambiguous);
});

test("a synthetic value in the masked snapshot never appears in a fill or hold", () => {
  const canary = "FAKE-fill-fields-canary-375";
  const maskedField = { ...password, value: canary };
  const fill = planFill([maskedField], ["password"], grantedFrame);
  const hold = planFill([maskedField], ["password", "otp"], grantedFrame);
  assert.deepEqual(fill, { decision: "fill", plan: [{ part: "password", fieldId: "password" }] });
  assert.deepEqual(hold, { decision: "hold", plan: fill.plan, reason: "no_match" });
  assert.ok(!JSON.stringify([fill, hold]).includes(canary));
});
