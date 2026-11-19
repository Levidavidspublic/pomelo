import assert from "node:assert/strict";
import test from "node:test";
import { decideType } from "../src/pomelo/browser-type-rule.js";
import { HIDDEN, hideSecrets } from "../src/secrets.js";

const canary = "pomelo-typing-fixture-012345";
const secretLikeText = `password=${canary}`;
const plainField = { type: "search", name: "query" };
const brokerMessage = "Use the 1Password broker tool to fill by reference.";
const decisions = {
  secret_field: { action: "refuse-use-broker", code: "secret_field", message: brokerMessage },
  secret_text: { action: "refuse-use-broker", code: "secret_text", message: brokerMessage },
  missing_field: { action: "hold", code: "missing_field", message: "A field description is required." },
  invalid_text: { action: "hold", code: "invalid_text", message: "Typing requires a text string." },
  allowed: { action: "allow", code: "allowed", message: "Typing is allowed." },
} as const;

const cases: {
  name: string;
  field: Parameters<typeof decideType>[0];
  text: unknown;
  code: keyof typeof decisions;
}[] = [
  { name: "password input", field: { type: "password" }, text: "sample", code: "secret_field" },
  ...["current-password", "new-password", "one-time-code", "cc-number", "cc-csc", "section-payment billing CC-NUMBER"].map(
    (autocomplete) => ({ name: `autocomplete ${autocomplete}`, field: { autocomplete }, text: "sample", code: "secret_field" as const }),
  ),
  ...["name", "label"].flatMap((attribute) =>
    ["Account Password", "newPassWord", "loginPasscode", "OTPCode", "payment_cvv", "PIN 2", "סיסמה", "Card number", "Card security code", "One-time code"].map(
      (value) => ({ name: `${attribute} ${value}`, field: { [attribute]: value }, text: "sample", code: "secret_field" as const }),
    ),
  ),
  { name: "mask-layer flag", field: { ...plainField, masked: true }, text: "sample", code: "secret_field" },
  { name: "broker-filled flag", field: { ...plainField, filledByBroker: true }, text: "sample", code: "secret_field" },
  { name: "search", field: plainField, text: "garden benches", code: "allowed" },
  { name: "email", field: { type: "email", autocomplete: "email" }, text: "example", code: "allowed" },
  { name: "given name", field: { type: "text", autocomplete: "given-name" }, text: "Sample", code: "allowed" },
  { name: "shipping address", field: { name: "shippingAddress", autocomplete: "shipping street-address" }, text: "1 Example Street", code: "allowed" },
  { name: "empty text", field: plainField, text: "", code: "allowed" },
  { name: "secret-shaped text", field: plainField, text: secretLikeText, code: "secret_text" },
  { name: "shield placeholder", field: plainField, text: HIDDEN, code: "secret_text" },
  { name: "missing field", field: undefined, text: "sample", code: "missing_field" },
  { name: "null field", field: null, text: "sample", code: "missing_field" },
  { name: "non-string text", field: plainField, text: { value: canary }, code: "invalid_text" },
];

test("Friday's shield detects the synthetic secret-shaped fixture", () => {
  assert.ok(hideSecrets(secretLikeText).hidden > 0);
});

for (const { name, field, text, code } of cases) {
  test(name, () => {
    assert.deepEqual(decideType(field, text), decisions[code]);
  });
}

test("no decision includes the typing canary or its base64 form", () => {
  const canaries = [canary, secretLikeText].flatMap((value) => [value, Buffer.from(value).toString("base64")]);
  for (const { name, field, text } of cases) {
    for (const proposedText of [text, canary, secretLikeText]) {
      const serialized = JSON.stringify(decideType(field, proposedText));
      for (const value of canaries) {
        assert.equal(serialized.includes(value), false, name);
      }
    }
  }
});
