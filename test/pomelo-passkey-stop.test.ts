import assert from "node:assert/strict";
import test from "node:test";
import { detectPasskeyPrompt, type PasskeyPromptKind, type PasskeyPromptRead } from "../src/pomelo/browser/passkey-stop.js";

function assertHold(read: PasskeyPromptRead, kind: PasskeyPromptKind, passwordOptionOffered = false) {
  const result = detectPasskeyPrompt(read);
  assert.equal(result.verdict, "hold");
  assert.equal(result.kind, kind);
  assert.equal(result.passwordOptionOffered, passwordOptionOffered);
  assert.deepEqual(result.mustNot, ["virtual-authenticator", "try-another-way", "retry"]);
  return result;
}

test("returns none for missing, empty, and ordinary page reads", () => {
  assert.deepEqual(detectPasskeyPrompt(), { verdict: "none" });
  for (const read of [null, {}, { text: "  \n", buttonLabels: [], items: [], webauthnPending: false }, {
    text: "Sign in\nPassword\nContinue",
    buttonLabels: ["Continue"],
  }]) {
    assert.deepEqual(detectPasskeyPrompt(read), { verdict: "none" });
  }
});

test("a pending WebAuthn request holds even with no prompt text or with a signed-in message", () => {
  assertHold({ webauthnPending: true }, "passkey");
  assertHold({ webauthnPending: true, text: "You are signed in." }, "passkey");
});

const prompts: ReadonlyArray<readonly [string, PasskeyPromptKind]> = [
  ["  Use your PASSKEY  ", "passkey"],
  ["Sign in with a passkey", "passkey"],
  ["מפתח גישה", "passkey"],
  ["Insert your security key", "security-key"],
  ["Touch your security key", "security-key"],
  ["מפתח אבטחה", "security-key"],
  ["Use your fingerprint", "device-biometric"],
  ["Face ID", "device-biometric"],
  ["Windows Hello", "device-biometric"],
  ["טביעת אצבע", "device-biometric"],
];

for (const [label, kind] of prompts) {
  test(`holds for ${label.trim()} in a dialog or button`, () => {
    assertHold({ dialogText: `Verify your identity\n${label}` }, kind);
    assertHold({ buttonLabels: [label] }, kind);
  });
}

test("uses visible prompt text next to a numbered Friday button", () => {
  assertHold({
    text: "Sign in\nUse your passkey.\n\nContinue",
    items: ['[1] button "Continue"'],
  }, "passkey");
  assertHold({ text: "Use your fingerprint", buttonLabels: ["Continue"] }, "device-biometric");
});

test("uses the dialog kind when WebAuthn is pending and another method is listed", () => {
  assertHold({ webauthnPending: true, dialogText: "Touch your security key", buttonLabels: ["Use your passkey"] }, "security-key");
});

test("ignores passkey articles, isolated headings, and unrelated controls", () => {
  const article = "Passkeys make passwords optional. You may see ‘Use your passkey’ during sign-in.\n".repeat(20);
  assert.deepEqual(detectPasskeyPrompt({ text: article, buttonLabels: ["Read more"] }), { verdict: "none" });
  assert.deepEqual(detectPasskeyPrompt({ text: "Use your passkey" }), { verdict: "none" });
  assert.deepEqual(detectPasskeyPrompt({
    text: `Use your passkey\n${article}Subscribe`,
    items: ['[1] button "Subscribe"'],
  }), { verdict: "none" });
});

test("reports a password option without selecting it or another sign-in method", () => {
  const read = Object.freeze({
    text: "Use your passkey",
    items: Object.freeze(['[1] button "Try another way"', '[2] button "Use password instead"']),
  });
  assertHold(read, "passkey", true);
  assertHold({ ...read, items: [read.items[0]] }, "passkey");
  assertHold({ dialogText: "מפתח גישה", buttonLabels: ["שימוש בסיסמה במקום זאת"] }, "passkey", true);
  assert.deepEqual(detectPasskeyPrompt({ buttonLabels: ["Use password instead"] }), { verdict: "none" });
});

test("skips mask markers and keeps page text out of the single-sentence reason", () => {
  assert.deepEqual(detectPasskeyPrompt({ dialogText: "•••• [secret hidden]" }), { verdict: "none" });
  const plain = assertHold({ dialogText: "Use your passkey" }, "passkey");
  const masked = assertHold({
    dialogText: "Site fixture\n•••• Use your passkey [secret hidden]",
    buttonLabels: ["[secret hidden]"],
  }, "passkey");
  assert.deepEqual(masked, plain);
  assert.match(masked.reason, /^[^.!?]+\.$/);
  assert.match(masked.reason, /passkey/);
  assert.doesNotMatch(masked.reason, /••••|secret hidden|site fixture|password|retry|try another way/i);
});
