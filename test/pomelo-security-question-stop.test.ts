import assert from "node:assert/strict";
import test from "node:test";
import {
  checkSecurityQuestion,
  SECURITY_QUESTION_WORDS,
  type SecurityQuestionPageRead,
  type SecurityQuestionStopResult,
} from "../src/pomelo/browser/security-question-stop.js";

const answer = Object.freeze({ label: "Your answer", type: "text", masked: false });
const page = Object.freeze({
  title: "Confirm your identity",
  text: "",
  items: Object.freeze([]),
  fields: Object.freeze([answer]),
}) satisfies SecurityQuestionPageRead;

const question = "What was the name of your first pet?";

function expectHold(read: unknown, fieldCount = 1): Extract<SecurityQuestionStopResult, { stop: true }> {
  const result = checkSecurityQuestion(read);
  assert.equal(result.stop, true);
  assert.equal(result.status, "waiting");
  assert.equal(result.reason, "security_question");
  assert.equal(result.fieldCount, fieldCount);
  return result;
}

test("holds for familiar English prompts next to a text field", () => {
  for (const text of [
    question,
    "What is your mother’s maiden name?",
    "What city were you born in?",
    "What is the city you were born in?",
    "What was your FIRST\nSCHOOL?",
    "Answer your secret question",
  ]) {
    expectHold({ ...page, text });
  }
  expectHold({ ...page, title: "Security question" });
  expectHold({ ...page, items: ['[1] heading "Answer your secret question"'] });
  expectHold({ ...page, fields: [{ ...answer, label: question }] });
});

test("holds for familiar Hebrew prompts and respects Hebrew word boundaries", () => {
  for (const text of [
    "מה היה שמה של חיית המחמד הראשונה שלך?",
    "מה שם הנעורים של אמך?",
    "באיזו עיר נולדת?",
    "מה שם בית הספר הראשון שלך?",
    "ענו על שְׁאֵלַת הָאַבְטָחָה",
  ]) {
    expectHold({ ...page, text });
  }
  for (const text of ["משאלת אבטחה", "שאלת אבטחת המידע", "insecurity question", "first petting zoo"]) {
    assert.deepEqual(checkSecurityQuestion({ ...page, text }), { stop: false });
  }
});

test("holds for a security-answer field label or name without question wording", () => {
  expectHold({ ...page, fields: [{ ...answer, label: "Security answer" }] });
  expectHold({ ...page, fields: [{ ...answer, label: "", name: "securityQuestionAnswer", masked: true }] });
  expectHold({ ...page, fields: [{ ...answer, label: "תשובת אבטחה", type: "password", masked: true }] });
});

test("continues on help pages without an answer field, regular logins and password-only pages", () => {
  const password = { label: "Password", type: "password", masked: true };
  const text = "Read about how security questions work.";
  for (const fields of [
    [],
    [{ label: "Search help", type: "text", masked: false }],
    [{ label: "Security answer", type: "button", masked: false }],
    [password],
    [{ label: "Username", type: "text", masked: false }, password],
  ]) {
    assert.deepEqual(checkSecurityQuestion({ ...page, text, fields }), { stop: false });
  }
  assert.deepEqual(checkSecurityQuestion({ ...page, fields: [password] }), { stop: false });
  assert.deepEqual(checkSecurityQuestion({
    ...page,
    title: "Sign in",
    fields: [{ label: "Username", type: "text", masked: false }, password],
  }), { stop: false });
});

test("ignores field values, including values in serialized controls", () => {
  const field = {
    ...answer,
    get value(): never {
      throw new Error("The rule read a field value");
    },
  };
  assert.deepEqual(checkSecurityQuestion({
    ...page,
    fields: [field],
    items: ['[1] field:text "Your answer" = Answer your secret question'],
  }), { stop: false });
  expectHold({ ...page, text: question, fields: [field] });
});

test("returns only fixed handoff copy, the two choices, forbidden actions and a field count", () => {
  const canary = 'fixture "canary"\n\\check';
  const read = {
    ...page,
    title: canary,
    text: `${question} ${canary}`,
    fields: [{ ...answer, label: canary, value: canary }, { ...answer, type: "hidden" }],
  };
  const result = expectHold(read, 2);
  assert.deepEqual(result.card.allowedAnswers, ["I answered it myself", "Cancel the job"]);
  assert.deepEqual(result.forbiddenActions, ["type into the answer field", "forgot answer", "try another way", "skip"]);
  assert.ok(result.card.line.includes("Amit"));
  const serialized = JSON.stringify(result);
  for (const text of [question, canary, JSON.stringify(canary).slice(1, -1)]) {
    assert.ok(!serialized.includes(text));
  }
  assert.deepEqual(checkSecurityQuestion(read), result);
});

test("fails closed on malformed reads without leaking errors or page text", () => {
  const unreadable = expectHold(null, 0);
  assert.match(unreadable.card.line, /page could not be read/i);
  for (const read of [
    "fixture page",
    {},
    { ...page, fields: {} },
    { ...page, text: 42 },
    { ...page, items: [null] },
    { ...page, fields: [null] },
    { ...page, fields: [{ ...answer, label: 42 }] },
    { ...page, fields: [{ ...answer, name: false }] },
    { ...page, fields: [{ ...answer, type: [] }] },
    { ...page, fields: [{ ...answer, masked: "yes" }] },
    { ...page, get title() { throw new Error("fixture read failure"); } },
  ]) {
    assert.deepEqual(expectHold(read, 0), unreadable);
  }
});

test("freezes the exported word lists", () => {
  assert.ok(Object.isFrozen(SECURITY_QUESTION_WORDS));
  for (const words of Object.values(SECURITY_QUESTION_WORDS)) {
    assert.ok(Object.isFrozen(words));
    assert.ok(words.every(Object.isFrozen));
  }
});
