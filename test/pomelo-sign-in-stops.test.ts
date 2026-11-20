import assert from "node:assert/strict";
import test from "node:test";
import { SIGN_IN_STOP_RULES, signInStops, type SignInStopFacts } from "../src/pomelo/browser/sign-in-stops.js";
import { stepVerdict, type StepAnswer } from "../src/pomelo/browser/step-verdict.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";

const rules = [
  "captcha", "one-time-code", "passkey", "device-approval", "account-lock",
  "security-question", "signed-out", "new-password", "wrong-account",
] as const;
type Rule = typeof rules[number];

const origin = "https://fixture.invalid";
const cleanPage = { url: `${origin}/home`, title: "Home", text: "Welcome back.", items: [] };
const facts: SignInStopFacts = {
  expectedAccount: "Fixture account",
  signedOut: { jobOrigins: [origin], previousStepSignedIn: true, matchingReferenceCount: 0 },
};
const canary = "made-up_FIXTURE-795";

function expectedAnswers(holds: Partial<Record<Rule, string>> = {}): StepAnswer[] {
  return rules.map((rule) => holds[rule] === undefined
    ? { rule, answer: "go", reasonCode: "clear" }
    : { rule, answer: "hold", reasonCode: holds[rule] });
}

test("the frozen required rules and clean answers share their fixed order", () => {
  assert.deepEqual(SIGN_IN_STOP_RULES, rules);
  assert.equal(Object.isFrozen(SIGN_IN_STOP_RULES), true);
  const answers = signInStops(cleanPage, facts);
  assert.deepEqual(answers, expectedAnswers());
  const verdict = stepVerdict(answers, SIGN_IN_STOP_RULES);
  assert.equal(verdict.verdict, "go");
  assert.deepEqual(verdict.missing, []);
});

const prompts = {
  captcha: { text: "Verify that you are human." },
  "one-time-code": { fields: [{ type: "text", autocomplete: "one-time-code" }] },
  passkey: { dialogText: "Use a passkey" },
  "device-approval": { text: "Approve the sign-in on your phone." },
  "account-lock": { text: "Your account is locked." },
  "security-question": { fields: [{ type: "text", label: "Secret question answer" }] },
  "signed-out": { text: "Your session has expired." },
  "new-password": { text: "Choose a new password." },
  "wrong-account": { seen: [{ text: "Other fixture account", where: "Profile menu" }] },
} satisfies Record<Rule, object>;

for (const rule of rules) {
  test(`${rule} holds the step on its own`, () => {
    const answers = signInStops({ ...cleanPage, ...prompts[rule] }, facts);
    assert.deepEqual(answers, expectedAnswers({ [rule]: rule }));
    const verdict = stepVerdict(answers, SIGN_IN_STOP_RULES);
    assert.equal(verdict.verdict, "hold");
    assert.deepEqual(verdict.decidedBy, [rule]);
    assert.deepEqual(verdict.missing, []);
  });
}

test("the scan reports both holds when two rules detect a prompt", () => {
  const page = { ...cleanPage, ...prompts.captcha, ...prompts["wrong-account"] };
  const answers = signInStops(page, facts);
  assert.deepEqual(answers, expectedAnswers({ captcha: "captcha", "wrong-account": "wrong-account" }));
  assert.deepEqual(stepVerdict(answers, SIGN_IN_STOP_RULES).decidedBy, ["captcha", "wrong-account"]);
});

test("a signed-out page with one eligible saved reference still holds the step", () => {
  const answers = signInStops({ ...cleanPage, ...prompts["signed-out"] }, {
    ...facts,
    signedOut: { ...facts.signedOut, matchingReferenceCount: 1 },
  });
  assert.deepEqual(answers, expectedAnswers({ "signed-out": "signed-out-broker" }));
  assert.equal(stepVerdict(answers, SIGN_IN_STOP_RULES).verdict, "hold");
});

test("a throwing rule holds with rule-error and subsequent rules still run", () => {
  const page = {
    ...cleanPage,
    ...prompts["wrong-account"],
    get dialogText(): string {
      throw new Error(canary);
    },
  };
  const answers = signInStops(page, facts);
  assert.deepEqual(answers, expectedAnswers({ passkey: "rule-error", "wrong-account": "wrong-account" }));
  assertNoCanary(canary, { answers: JSON.stringify(answers) });
});

test("a rule that reports unreadable input holds with rule-error", () => {
  const page = { ...cleanPage, elements: [{ type: 42 }] };
  const answers = signInStops(page, facts);
  assert.deepEqual(answers, expectedAnswers({ "new-password": "rule-error" }));
  assert.equal(stepVerdict(answers, SIGN_IN_STOP_RULES).verdict, "hold");
});

test("missing and non-object page reads hold every rule", () => {
  for (const page of [undefined, null, "", 42, false, []]) {
    const answers = signInStops(page, facts);
    assert.deepEqual(answers, rules.map((rule) => ({ rule, answer: "hold", reasonCode: "rule-error" })));
    assert.equal(stepVerdict(answers, SIGN_IN_STOP_RULES).verdict, "hold");
  }
});

test("scan answers omit canary text from page content, URLs, and account marks", () => {
  const page = {
    ...cleanPage,
    url: `https://${canary.toLowerCase()}.fixture.invalid/${canary}`,
    text: canary,
    fields: [{ type: "text", autocomplete: "one-time-code", value: canary }],
    seen: [{ text: canary, where: "Profile menu" }],
  };
  const answers = signInStops(page, facts);
  assert.deepEqual(answers, expectedAnswers({ "one-time-code": "one-time-code", "wrong-account": "wrong-account" }));
  const sources = { answers: JSON.stringify(answers) };
  assertNoCanary(canary, sources);
  assertNoCanary(canary.toLowerCase(), sources);
});
