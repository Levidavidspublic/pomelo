import assert from "node:assert/strict";
import test from "node:test";
import { deviceApprovalStop } from "../src/pomelo/browser/device-approval-stop.js";

const page = { url: "https://signin.example.test/challenge?flow=fixture#continue" };
const noStop = { stop: false, kind: null, reason: null, card: { title: "", body: "" }, blockedActions: [] };

for (const [text, kind] of [
  ["Check your phone. Tap Yes on the prompt", "phone-prompt"],
  ["Approve this sign-in on your phone", "phone-prompt"],
  ["Open your authenticator app and approve the sign-in request", "phone-prompt"],
  ["Check your email to confirm it's you", "email-link"],
  ["We don't recognise this device", "new-device"],
  ["Unusual sign-in. Confirm it’s you.", "new-device"],
  ["Waiting for sign-in approval", "unknown"],
  ["אשר את הכניסה בטלפון שלך", "phone-prompt"],
  ["פתח את הקישור שנשלח אליך בדוא״ל כדי לאשר את הכניסה", "email-link"],
  ["איננו מזהים את המכשיר הזה", "new-device"],
] as const) {
  test(`holds ${JSON.stringify(text)} as ${kind}`, () => {
    const result = deviceApprovalStop({ ...page, text });

    assert.equal(result.stop, true);
    assert.equal(result.kind, kind);
    assert.ok(result.reason);
    assert.ok(result.card.title);
    assert.deepEqual(result.blockedActions, []);
  });
}

test("names the host and asks Amit to approve on his phone without repeating a number match", () => {
  const result = deviceApprovalStop({ ...page, text: "Tap 47 on your phone" });

  assert.equal(result.kind, "phone-prompt");
  assert.match(result.card.body, /signin\.example\.test.*Amit.*phone/i);
  assert.doesNotMatch(JSON.stringify(result), /47|challenge|flow=fixture|#continue/);
});

test("asks Amit to open the confirmation link without repeating the address", () => {
  const result = deviceApprovalStop({
    ...page,
    text: "We sent a link to a***@example.test. Open it to confirm it's you",
  });

  assert.equal(result.kind, "email-link");
  assert.match(result.card.body, /Amit.*(?:open|follow).*link/i);
  assert.doesNotMatch(JSON.stringify(result), /a\*\*\*|@/);
});

test("reads prompts from items and structured page text", () => {
  assert.equal(deviceApprovalStop({ items: ["Approve this sign-in on your phone"] }).kind, "phone-prompt");
  assert.equal(deviceApprovalStop({ title: "We detected a new device", items: ['[1] button "\\q"'] }).kind, "new-device");
  assert.equal(deviceApprovalStop({ elements: [
    { role: "heading", name: "Unusual sign-in" },
    { role: "paragraph", text: "Confirm it's you" },
  ] }).kind, "new-device");
});

test("leaves typed codes to the one-time-code rule", () => {
  const text = "Check your email to confirm it's you";
  const fields = Array.from({ length: 6 }, () => ({ role: "textbox", maxlength: 1, value: "••••" }));
  assert.deepEqual(deviceApprovalStop({ ...page, text, fields, elements: [{ role: "heading", text }] }), noStop);
  assert.deepEqual(deviceApprovalStop({ ...page, text, elements: [{ type: "text", autocomplete: "one-time-code" }] }), noStop);
  assert.deepEqual(deviceApprovalStop({ ...page, text, items: ['[1] field:text "Verification code" = ••••'] }), noStop);
  assert.deepEqual(deviceApprovalStop({ ...page, text: `${text}, or enter the verification code below.`, fields: [{ role: "textbox" }] }), noStop);
  assert.equal(deviceApprovalStop({ ...page, text, fields: [{ type: "text", name: "postal-code" }] }).stop, true);
});

test("keeps device settings, help articles, passkey screens and ordinary sign-in forms outside this rule", () => {
  for (const read of [
    { title: "Your devices", text: "Review your devices or remember this device next time." },
    { title: "Help Center", text: "Check your phone. Tap Yes on the prompt." },
    { title: "Sign-in support", text: 'If you see "We don’t recognise this device", follow the steps in this article.' },
    { title: "Use a passkey", text: "Use Face ID or a security key to sign in." },
    { title: "Sign in", fields: [{ type: "email" }, { type: "password" }] },
  ]) {
    assert.deepEqual(deviceApprovalStop({ ...page, ...read }), noStop);
  }
});

test("lists only the blocked controls present on the waiting page", () => {
  const text = "Approve this sign-in on your phone";
  const result = deviceApprovalStop({
    ...page,
    text,
    elements: [
      { role: "button", name: "Resend" },
      { role: "button", label: "Try another way" },
      { type: "submit", text: "Use a different method" },
      { role: "checkbox", name: "Remember this device" },
      { role: "paragraph", text: "Send again" },
      { role: "button", name: "Continue" },
    ],
    items: ['[1] button "Resend"', '[2] link "I don’t have my phone" → https://signin.example.test/methods', '[3] button "Send again"'],
  });

  assert.deepEqual(result.blockedActions, [
    "Resend", "Try another way", "Use a different method", "Remember this device", "I don't have my phone", "Send again",
  ]);
  assert.deepEqual(deviceApprovalStop({ ...page, text: `${text}. Resend or try another way.` }).blockedActions, []);
  assert.deepEqual(deviceApprovalStop({ text, elements: [{ role: "button", name: "שלח שוב" }] }).blockedActions, ["שלח שוב"]);
});

test("handles empty reads, title-only reads and invalid URLs", () => {
  assert.deepEqual(deviceApprovalStop({}), noStop);
  assert.deepEqual(deviceApprovalStop({ title: "Sign in" }), noStop);
  assert.equal(deviceApprovalStop({ title: "We don't recognise this device" }).kind, "new-device");
  assert.match(deviceApprovalStop({ title: "Waiting for sign-in approval", url: "invalid URL" }).card.body, /^This site/);
});

test("does not return the canary from a field value, URL query or button label", () => {
  const canary = "POMELO_OTP_TEST_CANARY";
  const result = deviceApprovalStop({
    url: `https://signin.example.test/challenge?state=${canary}`,
    text: "Approve this sign-in on your phone",
    fields: [{ type: "password", value: canary }],
    elements: [{ role: "button", name: `Resend ${canary}` }],
    items: [`[1] field:text "" = ${canary}`],
  });

  assert.equal(result.stop, true);
  assert.doesNotMatch(JSON.stringify(result), /POMELO_OTP_TEST_CANARY/);
});

test("never reads the field value slot", () => {
  const field = { type: "text", get value(): string { return assert.fail("the rule read the field value"); } };
  assert.equal(deviceApprovalStop({ text: "Check your phone. Tap Yes on the prompt", fields: [field] }).stop, true);
});
