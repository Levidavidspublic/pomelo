import assert from "node:assert/strict";
import test from "node:test";
import { checkLockout, LOCKOUT_WORDS, type LockoutStopResult } from "../src/pomelo/browser/lockout-stop.js";
import { MASK } from "../src/pomelo/mask.js";

const origin = "https://example.invalid";
const page = Object.freeze({
  title: "Workspace dashboard",
  url: `${origin}/workspace`,
  text: "Recent projects",
  cut: false,
  items: Object.freeze([]),
});

type HoldReason = Extract<LockoutStopResult, { state: "hold_for_amit" }>["reason"];

function expectHold(read: unknown, reason: HoldReason, pageOrigin: string | null = origin) {
  assert.deepEqual(checkLockout(read), {
    state: "hold_for_amit",
    reason,
    origin: pageOrigin,
    forbiddenActions: ["fill", "reset", "answer"],
  });
}

test("continues on an ordinary page with a reset-password link and a masked field", () => {
  const read = {
    ...page,
    url: `${origin}/account-locked?note=too-many-attempts`,
    items: [`[1] field:password "Password" = ${MASK}`, '[2] link "Reset password"'],
  };
  assert.deepEqual(checkLockout(read), { state: "go", origin });
  assert.deepEqual(checkLockout({ ...page, cut: true }), { state: "go", origin });
});

test("detects English and Hebrew lockout wording in the title, text and items", () => {
  expectHold({ ...page, title: "Your account has been locked" }, "account_locked");
  expectHold({ ...page, text: "החשבון שלך ננעל" }, "account_locked");
  expectHold({ ...page, text: "חשבונך נחסם" }, "account_locked");
  expectHold({ ...page, text: "Too many failed attempts, try again in 15 minutes" }, "too_many_tries");
  expectHold({ ...page, items: ['[1] button "יותר מדי ניסיונות"'] }, "too_many_tries");
  expectHold({ ...page, text: "We noticed unusual activity" }, "suspicious_sign_in");
  expectHold({ ...page, title: "Your sign-in looks suspicious" }, "suspicious_sign_in");
  expectHold({ ...page, title: "זיהינו ניסיון התחברות חשוד" }, "suspicious_sign_in");
});

test("holds for security-question instructions and familiar challenge prompts", () => {
  expectHold({
    ...page,
    text: "Answer your security question to continue",
    items: ['[1] field:text "Your answer"'],
  }, "security_question");
  expectHold({ ...page, items: ['[1] field:text "ענו על שאלת האבטחה"'] }, "security_question");
  expectHold({ ...page, text: "What was the name of your first pet?" }, "security_question");
});

test("holds for a mention of locked accounts in a long help article without a form", () => {
  expectHold({
    ...page,
    title: "Help center",
    text: "Browse the topics in this guide. ".repeat(300) + "Read our guide to locked accounts.",
    items: [`[1] link "Contact support" → ${origin}/support`],
  }, "account_locked");
});

test("holds on a lock word in an incomplete or malformed read", () => {
  expectHold({ ...page, cut: true, text: "If you still see: Locked" }, "account_locked");
  expectHold({ ...page, cut: true, text: "לתשומת לבך: נעול" }, "account_locked");
  expectHold({ ...page, items: [null, '[2] button "Locked"'] }, "account_locked");
  expectHold({ ...page, items: ['[1] button "Locked', '[2] button "Continue"'] }, "account_locked");
  expectHold({ ...page, items: ['[1] button "\\x"', '[2] button "Locked"'] }, "account_locked");
  expectHold({ ...page, url: "not an address", text: "Account locked" }, "account_locked", null);
});

test("returns a fixed hold for invalid reads with no recognizable warning", () => {
  for (const read of [undefined, null, "page", [], {}]) {
    expectHold(read, "bad_input", null);
  }
  expectHold({ ...page, text: 123 }, "bad_input");
  expectHold({ ...page, items: [false] }, "bad_input");
  expectHold({ ...page, cut: "yes" }, "bad_input");
  expectHold({ ...page, url: "file:///example" }, "bad_input", null);
});

test("returns the origin and fixed decision without fixture text or field values", () => {
  const canary = "fixture-lockout-canary-501";
  let fieldReads = 0;
  const read = {
    ...page,
    title: canary,
    url: `${origin}/${canary}?note=${canary}#${canary}`,
    text: `Your account has been locked. ${canary}`,
    items: [`[1] field:text "${canary}" = ${canary}`],
    get fields() {
      fieldReads++;
      return [{ value: canary }];
    },
  };
  expectHold(read, "account_locked");
  assert.ok(!JSON.stringify(checkLockout(read)).includes(canary));
  assert.equal(fieldReads, 0);
});

test("only examines the visible label of a serialized browser item", () => {
  const items = [
    '[1] field:text "Search" = Account locked',
    `[2] link "Help" → ${origin}/?notice=security question`,
  ];
  assert.deepEqual(checkLockout({ ...page, items }), { state: "go", origin });
  expectHold({ ...page, items: ['[1] button "Status: \\"Account locked\\""'] }, "account_locked");
});

test("freezes the exported word lists", () => {
  assert.ok(Object.isFrozen(LOCKOUT_WORDS));
  for (const words of Object.values(LOCKOUT_WORDS)) {
    assert.ok(Object.isFrozen(words));
    assert.ok(words.every(Object.isFrozen));
  }
});
