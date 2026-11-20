import assert from "node:assert/strict";
import test from "node:test";
import { MASK } from "../src/pomelo/mask.js";
import { signUpStop, type SignUpPageRead } from "../src/pomelo/browser/sign-up-stop.js";

const createAccount = {
  title: "Create your account",
  text: "Create your account to get started.",
  buttons: [{ label: "Sign up" }],
  fields: [
    { label: "Full name", type: "text" },
    { label: "Email", type: "email" },
    { label: "Password", type: "password", value: MASK },
    { label: "Confirm password", type: "password", value: MASK },
  ],
} satisfies SignUpPageRead;

test("holds an account creation form for Amit", () => {
  const result = signUpStop(createAccount);
  assert.equal(result.action, "hold");
  assert.match(result.reason, /Amit/);
  assert.ok(result.signals.includes("sign-up-button"));
  assert.ok(result.signals.includes("confirm-password-field"));
});

test("recognizes Hebrew account creation in Friday's numbered controls", () => {
  const result = signUpStop({
    title: "הַרְשָׁמָה",
    text: "יצירת חשבון",
    items: ['[1] field:email "דוא״ל"', '[2] field:submit "הרשמה" = הרשמה'],
  });
  assert.equal(result.action, "hold");
  assert.ok(result.signals.includes("sign-up-button"));
});

test("holds a social-only sign-up page", () => {
  const joinPage = {
    text: "Join",
    items: ['[1] button "Continue with Google"'],
  };
  for (const page of [
    joinPage,
    { ...joinPage, items: [...joinPage.items, '[2] button "Sign up with Apple"'] },
  ]) {
    const result = signUpStop(page);
    assert.equal(result.action, "hold");
    assert.ok(result.signals.includes("social-sign-up"));
  }
});

test("recognizes a confirm-password field even when the submit button just says Continue", () => {
  for (const text of ["Register", "Join free", "ＳＴＡＲＴ　Ａ　ＦＲＥＥ　ＡＣＣＯＵＮＴ"]) {
    const result = signUpStop({
      text,
      items: ['[1] field:password "Confirm password"', '[2] button "Continue"'],
    });
    assert.equal(result.action, "hold");
    assert.ok(result.signals.includes("confirm-password-field"));
  }
});

test("defers a sign-in form with a sign-up link to the signed-out rule", () => {
  const result = signUpStop({
    title: "Sign in",
    text: "Email\nPassword\nSign in\nNo account? Sign up",
    fields: [{ label: "Email", type: "email" }, { label: "Password", type: "password" }],
    buttons: [{ label: "Sign in" }],
    items: ['[3] link "Sign up" → https://example.invalid/register'],
  });
  assert.equal(result.action, "go");
  assert.match(result.reason, /signed-out rule/);
});

test("continues when an article has a sign-up link in the footer", () => {
  const result = signUpStop({
    title: "Growing citrus",
    text: "How to care for a pomelo tree.\nAbout | Sign up",
    items: ['[1] link "Sign up" → https://example.invalid/register'],
  });
  assert.equal(result.action, "go");
});

test("defers a one-email newsletter box to the overlay rule", () => {
  const result = signUpStop({
    title: "Sign up",
    text: "Sign up for our newsletter",
    buttons: [{ label: "Sign up" }],
    fields: [{ label: "Email", type: "email" }],
  });
  assert.equal(result.action, "go");
  assert.match(result.reason, /overlay rule/);
});

test("holds a registration form alongside a newsletter or a sign-in button", () => {
  const email = { label: "Email", type: "email" };
  const signUp = { label: "Sign up" };
  assert.equal(signUpStop({
    title: "Create your account",
    text: "Sign up for our newsletter",
    buttons: [signUp],
    fields: [email],
  }).action, "hold");
  assert.equal(signUpStop({
    text: "Welcome",
    buttons: [signUp, { label: "Sign in" }],
    fields: [email, { label: "Password", type: "password" }],
  }).action, "hold");
});

test("holds when the masked read is unreadable", () => {
  for (const read of [
    undefined,
    "Create an account",
    { title: "Create your account" },
    { ...createAccount, text: " \n " },
    { ...createAccount, text: MASK },
    { text: "Register", fields: [null] },
  ]) {
    const result = signUpStop(read);
    assert.equal(result.action, "hold");
    assert.ok(result.signals.includes("unreadable-page"));
  }
});

test("keeps field values and masked markers out of the decision", () => {
  const canary = "fixture-only-sign-up-773";
  const result = signUpStop({
    ...createAccount,
    text: `${createAccount.text}\n${MASK}${canary}${MASK}`,
    fields: [...createAccount.fields, { label: "Display name", type: "text", value: canary }],
    items: [`[1] field:text "${MASK}" = ${canary}`],
  });
  assert.equal(result.action, "hold");
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(canary));
  assert.ok(!serialized.includes(MASK));
});

test("ignores a numbered field's value when identifying a submit label", () => {
  const result = signUpStop({
    title: "Create your account",
    text: "Create your account",
    items: ['[1] field:submit "Continue" = Sign up'],
  });
  assert.equal(result.action, "go");
});
