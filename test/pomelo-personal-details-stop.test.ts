import assert from "node:assert/strict";
import test from "node:test";
import { personalDetailsStop } from "../src/pomelo/browser/personal-details-stop.js";

const requiredField = { type: "text", required: true, value: "" };

for (const label of [
  "ID number", "Passport number", "תעודת זהות", "ת.ז", "  ＩＤ   ＮＵＭＢＥＲ  ",
  "National ID card number", "Identity card number", "Identity number",
]) {
  test(`holds for a required empty ${label} field`, () => {
    const result = personalDetailsStop({ fields: [{ ...requiredField, label }] });
    assert.equal(result.action, "hold");
    assert.deepEqual(result.kinds, ["id-number"]);
    assert.match(result.reason, /Amit/);
  });
}

test("reports one date-of-birth kind for day, month and year selects", () => {
  const fields = ["Day", "Month", "Year"].map((part) => ({
    ...requiredField, type: "select", label: `Date of birth (${part})`,
  }));
  assert.deepEqual(personalDetailsStop({ fields }).kinds, ["date-of-birth"]);
});

test("gives a national ID label priority over a card autocomplete hint", () => {
  const result = personalDetailsStop({
    fields: [{ ...requiredField, type: "tel", label: "National ID card number", autocomplete: "cc-number" }],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.kinds, ["id-number"]);
});

test("holds on required birth-date selects with unconfirmed options", () => {
  for (const [field, kind] of [
    [{ ...requiredField, type: "select", label: "Date of birth (year)", value: "Year" }, "date-of-birth"],
    [{ ...requiredField, type: "select-one", autocomplete: "bday-day", value: "1" }, "date-of-birth"],
    [{ ...requiredField, type: "select", label: "Enter your birth year", value: "Year" }, "age-check"],
  ] as const) {
    const result = personalDetailsStop({ fields: [field] });
    assert.equal(result.action, "hold");
    assert.deepEqual(result.kinds, [kind]);
  }
});

test("lets an optional or confirmed birth-date select pass", () => {
  const field = { type: "select", label: "Date of birth (year)" };
  for (const fields of [[{ ...field, required: false }], [{ ...field, required: true, hasAnswer: true }]]) {
    const result = personalDetailsStop({ fields });
    assert.equal(result.action, "go");
    assert.deepEqual(result.kinds, []);
  }
});

for (const [autocomplete, kind] of [
  ["bday", "date-of-birth"],
  ["section-contact mobile TEL", "phone"],
  ["street-address", "address"],
  ["shipping postal-code", "address"],
]) {
  test(`holds for the ${autocomplete} autocomplete hint with an unclear label`, () => {
    const result = personalDetailsStop({ fields: [{ ...requiredField, label: "Details", autocomplete }] });
    assert.equal(result.action, "hold");
    assert.deepEqual(result.kinds, [kind]);
  });
}

test("holds for age gates in buttons, titles and text", () => {
  for (const read of [
    { buttons: [{ label: "I am over 18" }, { label: "Exit" }] },
    { title: "Are you over 18?" },
    { text: "Enter your birth year" },
    { items: ['[1] button "אני מעל גיל 18"', '[2] button "Exit"'] },
  ]) {
    const result = personalDetailsStop(read);
    assert.equal(result.action, "hold");
    assert.deepEqual(result.kinds, ["age-check"]);
  }
});

test("lets the browser lane handle a search box", () => {
  const result = personalDetailsStop({ items: ['[1] field:search "Search by ID number"'] });
  assert.equal(result.action, "go");
  assert.deepEqual(result.kinds, []);
  assert.match(result.reason, /search/i);
});

test("defers an email and password sign-in form to the signed-out rule", () => {
  const result = personalDetailsStop({ items: [
    '[1] field:email "Email address"', '[2] field:password "Password"', '[3] field:submit "Sign in"',
  ] });
  assert.equal(result.action, "go");
  assert.deepEqual(result.kinds, []);
  assert.match(result.reason, /signed-out rule/i);
});

test("defers card and one-time-code fields to the typed-secret rule", () => {
  for (const field of [
    { ...requiredField, type: "tel", label: "Card number", autocomplete: "cc-number" },
    { ...requiredField, type: "tel", label: "Verification code", autocomplete: "one-time-code" },
    { ...requiredField, type: "tel", label: "One-time code" },
  ]) {
    const result = personalDetailsStop({ fields: [field] });
    assert.equal(result.action, "go");
    assert.deepEqual(result.kinds, []);
    assert.match(result.reason, /typed-secret rule/i);
  }
});

test("lets an optional phone field and a filled address pass even with duplicate numbered items", () => {
  const result = personalDetailsStop({
    fields: [
      { ...requiredField, type: "tel", label: "Phone number", required: false },
      { ...requiredField, label: "Street address", value: "••••" },
    ],
    items: ['[1] field:tel "Phone number"', '[2] field:text "Street address"'],
  });
  assert.equal(result.action, "go");
  assert.deepEqual(result.kinds, []);
});

test("uses numbered fields when structured facts are unavailable", () => {
  const result = personalDetailsStop({ items: [
    '[1] field:tel "Contact"',
    '[2] field:text "Postcode" = ••••',
    '[3] field:text "Passport number (optional)"',
    '[4] select "Date of birth — day"',
  ] });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.kinds, ["date-of-birth", "phone"]);
});

test("reports personal kinds once in a fixed order, even beside login and card fields", () => {
  const fields = ["Postcode", "Phone number", "Home address", "Birthday", "National ID", "Card number"]
    .map((label) => ({ ...requiredField, label }));
  fields.push({ ...requiredField, type: "email", label: "Email address" });
  fields.push({ ...requiredField, type: "password", label: "Password" });
  const kinds = ["id-number", "date-of-birth", "phone", "address", "age-check"];
  for (const order of [fields, [...fields].reverse()]) {
    const result = personalDetailsStop({ fields: order, title: "Are you over 18?" });
    assert.equal(result.action, "hold");
    assert.deepEqual(result.kinds, kinds);
  }
});

test("holds unreadable, empty or malformed masked reads", () => {
  for (const read of [undefined, "a page", {}, { title: " ", items: [], buttons: [], fields: [] },
    { fields: [null] }, { items: ["broken item"] }, { title: "Example", fields: [{ required: "yes" }] }]) {
    const result = personalDetailsStop(read);
    assert.equal(result.action, "hold");
    assert.deepEqual(result.kinds, []);
    assert.match(result.reason, /readable/i);
  }
});

test("only checks whether values are empty and never includes them in the result", () => {
  const canary = "POMELO_PERSONAL_DETAILS_TEST_CANARY";
  const value = `${canary} I am over 18`;
  const result = personalDetailsStop({
    fields: [
      { ...requiredField, label: "Phone number", value: "   " },
      { ...requiredField, label: "Street address", value },
    ],
    items: [`[1] field:text ${JSON.stringify(value)} = ${value}`],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.kinds, ["phone"]);
  assert.ok(!JSON.stringify(result).includes(canary));
});
