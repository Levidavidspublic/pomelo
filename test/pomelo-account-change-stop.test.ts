import assert from "node:assert/strict";
import test from "node:test";
import { accountChangeStop } from "../src/pomelo/browser/account-change-stop.js";

test("holds English account changes when the page offers a commit button", () => {
  for (const [title, label, signal, type] of [
    ["Change your email", "Save", "email-change", "email"],
    ["Update phone number", "Save changes", "phone-change", "tel"],
    ["Turn off 2-Step Verification", "Turn off", "two-step-off"],
    ["Add recovery email", "Add", "recovery-add", "email"],
    ["Sign out of all devices", "Sign out everywhere", "sign-out-all"],
    ["Delete your account", "Delete", "account-close"],
    ["Close account", "Confirm", "account-close"],
    ["Remove recovery phone", "Remove", "recovery-change"],
  ]) {
    const result = accountChangeStop({ title, buttons: [{ label }], fields: type ? [{ type }] : [] });
    assert.equal(result.action, "hold", title);
    assert.match(result.reason, /Amit/);
    assert.deepEqual(result.signals, [signal]);
  }
});

test("holds Hebrew account changes, including pointed Hebrew and bidi marks", () => {
  for (const [text, label, signal] of [
    ["שינוי כתובת אימייל", "שמירה", "email-change"],
    ["עדכון מספר הטלפון", "שמור שינויים", "phone-change"],
    ["כִּיבּוּי אימות דו־שלבי\u200f", "כבה", "two-step-off"],
    ["הוספת כתובת דוא״ל לשחזור", "הוסף", "recovery-add"],
    ["יציאה מכל המכשירים", "התנתק מכל המכשירים", "sign-out-all"],
    ["מחיקת החשבון", "מחק את החשבון", "account-close"],
  ]) {
    const result = accountChangeStop({ text, buttonLabels: [label] });
    assert.equal(result.action, "hold", text);
    assert.deepEqual(result.signals, [signal]);
  }
});

test("reads numbered field and submit metadata and ignores field values and link destinations", () => {
  const result = accountChangeStop({
    title: "Edit account details",
    items: [
      '[1] field:email "New email address" = ••••',
      '[2] field:submit "Save" = Save',
      '[3] link "Update phone number" → /account/phone',
    ],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["email-change"]);
  assert.equal(accountChangeStop({
    title: "Profile",
    items: ['[1] field:text "Display name" = New email address', '[2] button "Save"'],
  }).action, "go");
});

test("recognizes a direct account action and collects each fixed signal once", () => {
  const result = accountChangeStop({
    title: "Account security",
    buttonLabels: ["Turn off 2-Step Verification", "Sign out everywhere", "Sign out of all devices"],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["two-step-off", "sign-out-all"]);
});

test("uses the security topic and its matching commit wording", () => {
  assert.deepEqual(accountChangeStop({
    title: "2-Step Verification",
    buttons: [{ label: "Turn off" }],
  }).signals, ["two-step-off"]);
  assert.deepEqual(accountChangeStop({
    title: "Recovery email",
    buttons: [{ label: "Add" }],
  }).signals, ["recovery-add"]);
  assert.equal(accountChangeStop({
    title: "2-Step Verification",
    buttons: [{ label: "Save" }],
  }).action, "go");
});

test("reads a confirmation prompt and a submit control with only its field kind", () => {
  assert.deepEqual(accountChangeStop({
    title: "Are you sure you want to delete your account?",
    buttons: [{ label: "Yes, delete" }],
  }).signals, ["account-close"]);
  assert.deepEqual(accountChangeStop({
    title: "Add a recovery method",
    fieldKinds: ["email", "submit"],
  }).signals, ["recovery-add"]);
});

test("goes on references, navigation, a newsletter, and a new-password form", () => {
  for (const read of [
    { title: "Home", text: "Security", links: [{ label: "Security" }] },
    { title: "How to turn off 2-Step Verification", text: "Change your email from account settings.",
      buttons: [{ label: "Save article" }] },
    { title: "Settings", text: "Change your email\nSign out of all devices\nClose account",
      linkLabels: ["Change your email", "Sign out of all devices", "Close account"] },
    { title: "Profile settings", text: "Change your email", links: ["Change your email"], buttonLabels: ["Save"] },
    { title: "Profile settings", buttonLabels: ["Edit email address"] },
    { title: "Newsletter", fields: [{ type: "email", label: "Email address" }], buttonLabels: ["Subscribe"] },
    { title: "Create a new password", fields: [{ type: "password", autocomplete: "new-password" }],
      buttonLabels: ["Save"] },
    { title: "Sign out of all devices", buttonLabels: ["Cancel", "Learn more"] },
    { title: "Close account", buttons: [{ label: "Close", nearbyText: "Help dialog" }] },
  ]) {
    const result = accountChangeStop(read);
    assert.equal(result.action, "go", read.title);
    assert.deepEqual(result.signals, []);
  }
});

test("holds with a fixed reason when the masked read is malformed or empty", () => {
  for (const read of [undefined, null, [], {}, { text: "  " }, { title: 42 },
    { title: "Profile", buttons: [null] }, { buttonLabels: "Save" },
    { links: [42] }, { fields: [{ type: false }] }, { fieldKinds: [null] }, { items: ["unreadable"] }]) {
    const result = accountChangeStop(read);
    assert.equal(result.action, "hold");
    assert.match(result.reason, /could not read/i);
    assert.deepEqual(result.signals, ["unreadable-page"]);
  }
});

test("keeps synthetic page content and field values out of the decision", () => {
  const canary = "SYNTHETIC_ACCOUNT_CHANGE_CANARY";
  const result = accountChangeStop({
    title: "Change your email",
    text: `Current address: ${canary}`,
    fields: [{ type: "email", value: canary }],
    buttons: [{ label: "Save" }],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(Object.keys(result).sort(), ["action", "reason", "signals"]);
  assert.deepEqual(result.signals, ["email-change"]);
  assert.ok(!JSON.stringify(result).includes(canary));
});
