import assert from "node:assert/strict";
import test from "node:test";
import { decideDialog } from "../src/pomelo/browser-dialog-rule.js";

type DialogCase = [
  name: string,
  event: Parameters<typeof decideDialog>[0],
  context: Parameters<typeof decideDialog>[1],
  action: ReturnType<typeof decideDialog>["action"],
];

const page = { origin: "https://localhost", message: "Continue?" };
const unapproved = { step: "other", approved: false, acceptedDialog: false } as const;
const approvedSubmit = { step: "submit", approved: true, acceptedDialog: false } as const;
const afterAccept = { ...approvedSubmit, acceptedDialog: true };

const cases: DialogCase[] = [
  ["dismisses an alert", { ...page, type: "alert" }, unapproved, "dismiss"],
  ["holds an unapproved confirm", { ...page, type: "confirm" }, unapproved, "hold"],
  ["accepts a confirm during an approved submit", { ...page, type: "confirm" }, approvedSubmit, "accept"],
  ["holds a second confirm in the same step", { ...page, type: "confirm" }, afterAccept, "hold"],
  ["accepts beforeunload during an approved import", { ...page, type: "beforeunload", message: "" },
    { ...approvedSubmit, step: "import" }, "accept"],
  ["dismisses beforeunload to stay on the page", { ...page, type: "beforeunload" }, unapproved, "dismiss"],
  ["holds beforeunload after an acceptance in the same step", { ...page, type: "beforeunload" }, afterAccept, "hold"],
  ["dismisses a harmless prompt", { ...page, type: "prompt" }, approvedSubmit, "dismiss"],
  ["holds a prompt during a fill", { ...page, type: "prompt" }, { ...approvedSubmit, step: "fill" }, "hold"],
  ["holds an alert asking for a password", { ...page, type: "alert", message: "Enter your PASSWORD" }, unapproved, "hold"],
  ["holds an approved confirm asking for a verification code",
    { ...page, type: "confirm", message: "Confirm your verification code" }, approvedSubmit, "hold"],
  ["holds a password request in Hebrew", { ...page, type: "prompt", message: "הזן את הסיסמה שלך" }, unapproved, "hold"],
  ["holds a verification code request in Hebrew",
    { ...page, type: "beforeunload", message: "הזן קוד אימות" }, unapproved, "hold"],
  ["holds an unknown dialog type", { ...page, type: "unknown" }, approvedSubmit, "hold"],
  ["holds without a type", page, approvedSubmit, "hold"],
  ["holds without an origin", { type: "confirm", message: page.message }, approvedSubmit, "hold"],
  ["holds without a message", { type: "alert", origin: page.origin }, unapproved, "hold"],
  ["holds without a step", { ...page, type: "prompt" }, { approved: false, acceptedDialog: false }, "hold"],
  ["holds without approval status", { ...page, type: "beforeunload" },
    { step: "submit", acceptedDialog: false }, "hold"],
  ["holds without acceptance history", { ...page, type: "confirm" }, { step: "submit", approved: true }, "hold"],
  ["holds without an event", undefined, approvedSubmit, "hold"],
  ["holds without context", { ...page, type: "alert" }, undefined, "hold"],
];

for (const [name, event, context, action] of cases) {
  test(name, () => {
    const decision = decideDialog(event, context);
    assert.equal(decision.action, action);
    assert.equal(decision.promptText, null);
    assert.equal(decision.logText, event?.message ?? "");
    assert.ok(decision.reason);
  });
}

test("scrubs a password canary before truncating the log text", () => {
  const canary = "fake-dialog-canary-288";
  const prefix = "a".repeat(181) + " password=";
  const decision = decideDialog({ ...page, type: "confirm", message: prefix + canary }, approvedSubmit);

  assert.equal(decision.action, "hold");
  assert.equal(decision.promptText, null);
  assert.equal(decision.logText, (prefix + "[secret hidden]").slice(0, 200));
  assert.ok(!decision.logText.includes(canary));
  assert.ok(!decision.reason.includes(canary));
});

test("checks for credential requests beyond the log limit", () => {
  const prefix = "a".repeat(200);
  const decision = decideDialog(
    { ...page, type: "confirm", message: prefix + "\nEnter your verification code" },
    approvedSubmit,
  );

  assert.equal(decision.action, "hold");
  assert.equal(decision.logText, prefix);
  assert.equal(decision.promptText, null);
});
