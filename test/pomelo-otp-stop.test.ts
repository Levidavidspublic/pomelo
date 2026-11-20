import assert from "node:assert/strict";
import test from "node:test";
import { checkOneTimeCodeStop } from "../src/pomelo/browser/otp-stop.js";

const emptyRead = { title: "", url: "", text: "", items: [], fields: [] };
const page = { ...emptyRead, url: "https://signin.example.invalid/challenge?flow=fixture#continue" };
const codeField = { role: "textbox", type: "text", inputmode: "numeric", maxlength: 6 };

test("holds on the one-time-code autocomplete token and names the site in the card", () => {
  const result = checkOneTimeCodeStop({
    ...page,
    fields: [{ type: "text", autocomplete: "section-signin ONE-TIME-CODE" }],
  });

  assert.equal(result.stop, true);
  assert.equal(result.kind, "unknown");
  assert.ok(result.reason);
  assert.ok(result.card.title);
  assert.match(result.card.body, /signin\.example\.invalid.*type the code yourself/i);
  assert.doesNotMatch(result.card.body, /challenge|flow=fixture|#continue/);
});

test("holds for a row of four to eight single-character input boxes", () => {
  for (const length of [4, 6, 8]) {
    const fields = Array.from({ length }, () => ({ role: "textbox", maxlength: 1 }));
    assert.equal(checkOneTimeCodeStop({ ...page, fields }).stop, true);
  }
});

test("a split row and runs outside four to eight boxes do not trigger a hold", () => {
  const box = { role: "textbox", maxlength: 1 };
  assert.equal(checkOneTimeCodeStop({ ...page, elements: [box, box, { role: "button" }, box, box] }).stop, false);
  for (const length of [3, 9]) {
    assert.equal(checkOneTimeCodeStop({ ...page, fields: Array.from({ length }, () => box) }).stop, false);
  }
});

test("classifies delivery wording immediately after a row", () => {
  const boxes = Array.from({ length: 6 }, () => ({ role: "textbox", maxlength: 1 }));
  const result = checkOneTimeCodeStop({ ...page, elements: [...boxes, { role: "paragraph", text: "We sent a text" }] });
  assert.equal(result.stop, true);
  assert.equal(result.kind, "sms");
});

for (const prompt of ["Enter your verification code", "הזן קוד אימות", "Enter the code", "2-step verification"]) {
  test(`holds for a short numeric box beside ${JSON.stringify(prompt)}`, () => {
    const result = checkOneTimeCodeStop({ ...page, text: prompt, fields: [codeField] });
    assert.equal(result.stop, true);
    assert.equal(result.kind, "unknown");
  });
}

test("uses a prompt on the field or on a neighboring element", () => {
  assert.equal(checkOneTimeCodeStop({ ...page, fields: [{ ...codeField, label: "Verification code" }] }).stop, true);
  assert.equal(checkOneTimeCodeStop({ ...page, elements: [
    { role: "heading", text: "Verification code" },
    { type: "number", maxlength: 6 },
  ] }).stop, true);
});

for (const [prompt, kind] of [
  ["Enter the code from your authenticator app", "authenticator"],
  ["We sent a text", "sms"],
  ["Check your email", "email"],
] as const) {
  test(`classifies ${JSON.stringify(prompt)} as ${kind}`, () => {
    const result = checkOneTimeCodeStop({ ...page, text: prompt, fields: [codeField] });
    assert.equal(result.stop, true);
    assert.equal(result.kind, kind);
  });
}

test("uses delivery wording beside the code field when the page mentions other methods", () => {
  const result = checkOneTimeCodeStop({
    ...page,
    text: "Use an authenticator app another time. Check your email.",
    fields: [{ ...codeField, label: "Verification code", text: "Check your email" }],
  });
  assert.equal(result.kind, "email");
});

for (const [description, field] of [
  ["search box", { ...codeField, type: "search" }],
  ["postcode field", { ...codeField, label: "Postcode", autocomplete: "shipping postal-code" }],
  ["card number field", { ...codeField, label: "Card number", autocomplete: "cc-number", maxlength: 19 }],
  ["card security field", { ...codeField, label: "Card security code", autocomplete: "cc-csc", maxlength: 4 }],
] as const) {
  test(`does not hold for an ordinary ${description} on a page mentioning a verification code`, () => {
    assert.equal(checkOneTimeCodeStop({ ...page, text: "Enter the code", fields: [field] }).stop, false);
  });
}

test("does not hold for a plain login form, wording alone, or an empty read", () => {
  assert.equal(checkOneTimeCodeStop({ ...page, fields: [
    { type: "email", autocomplete: "username" },
    { type: "password", autocomplete: "current-password" },
  ] }).stop, false);
  assert.equal(checkOneTimeCodeStop({ ...page, text: "Enter the code from your authenticator app" }).stop, false);
  assert.deepEqual(checkOneTimeCodeStop(emptyRead), {
    stop: false,
    kind: null,
    card: { title: "", body: "" },
    reason: null,
  });
});

test("a short numeric field by itself and a long numeric field beside code wording do not trigger a hold", () => {
  assert.equal(checkOneTimeCodeStop({ ...page, fields: [codeField] }).stop, false);
  assert.equal(checkOneTimeCodeStop({ ...page, text: "Enter the code", fields: [{ ...codeField, maxlength: 12 }] }).stop, false);
});

test("the result never contains a field value and the rule never reads the value slot", () => {
  const canary = "POMELO_OTP_TEST_CANARY";
  const read = { ...page, fields: [{ ...codeField, autocomplete: "one-time-code", value: canary }] };
  assert.equal(checkOneTimeCodeStop(read).stop, true);
  assert.doesNotMatch(JSON.stringify(checkOneTimeCodeStop(read)), /POMELO_OTP_TEST_CANARY/);

  const field = Object.defineProperty({ ...codeField, label: "Verification code" }, "value", {
    get() { assert.fail("the OTP rule read the field value"); },
  });
  assert.equal(checkOneTimeCodeStop({ ...page, fields: [field] }).stop, true);
});
