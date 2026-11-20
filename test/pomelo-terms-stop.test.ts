import assert from "node:assert/strict";
import test from "node:test";
import { termsStop } from "../src/pomelo/browser/terms-stop.js";

test("holds an unticked checkbox with agreement and legal wording on its label", () => {
  const result = termsStop({
    title: "Account setup",
    text: "Account details\nChoose your settings\nReview and save",
    checkboxes: [{ label: "I agree to the Terms of Service", checked: false }],
  });
  assert.equal(result.action, "hold");
  assert.match(result.reason, /Amit/);
  assert.deepEqual(result.signals, ["I agree"]);
});

test("holds an unticked acceptance checkbox beside legal wording", () => {
  for (const nearbyText of ["Terms and Conditions", "Privacy Policy", "Service contract", "Subscription"]) {
    const result = termsStop({
      checkboxes: [{ label: "I accept", checked: false, nearbyText }],
    });
    assert.equal(result.action, "hold", nearbyText);
    assert.deepEqual(result.signals, ["I accept"]);
  }
});

test("holds an Accept and continue button beneath updated terms", () => {
  const result = termsStop({
    title: "Account notice",
    text: "We have updated our terms\nAccept and continue",
    buttons: [{ label: "Accept and continue" }],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["Accept and continue"]);
  assert.equal(termsStop({
    buttons: [{ label: "Accept the Terms of Service" }],
  }).action, "hold");
  assert.equal(termsStop({
    title: "We have updated our terms",
    text: "Please review the changes.",
    buttons: [{ label: "Accept and continue" }],
  }).action, "hold");
});

test("holds the Hebrew agreement buttons beside Hebrew terms", () => {
  for (const label of ["אני מסכים", "אני מאשר"]) {
    const result = termsStop({
      text: "תנאים והגבלות מעודכנים",
      buttons: [{ label }],
    });
    assert.equal(result.action, "hold", label);
    assert.deepEqual(result.signals, [label]);
  }
});

test("holds confirmation of a priced plan change", () => {
  const label = "Confirm your new plan – $20/month";
  const result = termsStop({ buttons: [{ label }] });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["Confirm your new plan"]);
  assert.equal(termsStop({ text: label, buttons: [{ label: "Confirm" }] }).action, "hold");
});

test("distinguishes continuing past a legal prompt from ordinary navigation", () => {
  assert.equal(termsStop({
    text: "By continuing, you agree to the Terms of Service.\nContinue",
    items: ['[1] button "Continue"'],
  }).action, "hold");
  assert.equal(termsStop({
    text: "We have updated our terms\nWelcome to the survey\nAgree",
    buttons: [{ label: "Agree" }],
  }).action, "go");
  assert.equal(termsStop({
    text: "Choose a layout\nConfirm",
    buttons: [{ label: "Confirm" }],
  }).action, "go");
});

test("goes on a page with only footer terms links", () => {
  assert.equal(termsStop({ text: "Terms · Privacy" }).action, "go");
  assert.equal(termsStop({
    text: "Continue\nTerms · Privacy",
    buttons: [{ label: "Continue" }],
  }).action, "go");
});

test("defers cookie and tracking consent banners to the cookie-banner rule", () => {
  for (const [text, accept] of [
    ["We use cookies. See our Privacy Policy.", "Accept all"],
    ["Allow tracking? Read our Privacy Policy.", "Agree"],
    ["You agree to our use of cookies under the terms of our Privacy Policy.", "Agree"],
  ]) {
    const result = termsStop({ text, buttons: [{ label: accept }, { label: "Reject" }] });
    assert.equal(result.action, "go");
    assert.match(result.signals.join(" "), /cookie-banner rule/i);
  }
  const result = termsStop({
    text: "We use cookies. See our Privacy Policy.\nYou can change your choices at any time.\nAccept all\nReject",
    buttons: [{ label: "Accept all", blocksPage: false }, { label: "Reject", blocksPage: false }],
  });
  assert.equal(result.action, "go");
  assert.match(result.signals.join(" "), /cookie-banner rule/i);
});

test("holds legal agreement even when the page also has a cookie banner", () => {
  const result = termsStop({
    text: "We use cookies.\nAccept all\nReject\nWe have updated our terms\nAccept and continue",
    buttons: [{ label: "Accept all" }, { label: "Reject" }, { label: "Accept and continue" }],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["Accept and continue"]);
  assert.equal(termsStop({
    text: "We use cookies.\nAgree\nBy selecting Agree, you accept the Privacy Policy.\nAgree",
    buttons: [{ label: "Agree" }],
  }).action, "hold");
});

test("goes when an agreement is already checked and no blocking button is present", () => {
  const result = termsStop({
    checkboxes: [{ label: "I agree to the Terms of Service", checked: true }],
    buttons: [{ label: "Agree", blocksPage: false, nearbyText: "Terms of Service" }],
  });
  assert.equal(result.action, "go");
});

test("keeps a synthetic canary from the title, visible text, and control label out of the result", () => {
  const canary = "SYNTHETIC_TERMS_CANARY";
  const result = termsStop({
    title: canary,
    text: `We have updated our terms. ${canary}`,
    checkboxes: [{ label: `I agree to the Terms of Service (${canary})`, checked: false }],
  });
  assert.equal(result.action, "hold");
  assert.ok(!JSON.stringify(result).includes(canary));
});

test("holds with a plain reason when the masked read is empty or malformed", () => {
  for (const read of [
    undefined, null, [], {}, { text: "  ", buttons: [], checkboxes: [] },
    { title: 42 }, { text: "Ordinary page", buttons: "Agree" },
    { checkboxes: [{ label: "I agree" }] }, { buttons: [null] }, { items: ["unreadable"] },
  ]) {
    const result = termsStop(read);
    assert.equal(result.action, "hold");
    assert.match(result.reason, /^[^.!?\n]+\.$/);
    assert.match(result.reason, /page read/i);
    assert.deepEqual(result.signals, []);
  }
});
