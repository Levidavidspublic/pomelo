import assert from "node:assert/strict";
import test from "node:test";
import { accountChooser } from "../src/pomelo/browser/account-chooser.js";
import type { SignedOutPageRead } from "../src/pomelo/browser/signed-out-stop.js";

const wanted = "sample-primary@example.com";
const other = "sample-secondary@example.com";

const page = {
  title: "Workspace",
  url: "https://example.com/",
  text: "Recent projects",
  items: [],
} satisfies SignedOutPageRead;

function chooser(...items: string[]): SignedOutPageRead {
  return { ...page, title: "Choose an account", items };
}

function assertHold(read: SignedOutPageRead, account: string | undefined, seen: number) {
  const result = accountChooser(read, account);
  assert.equal(result.kind, "hold");
  assert.equal(result.seen, seen);
  assert.ok(result.reason.trim().length > 0);
  return result;
}

test("continues on an ordinary page even when it mentions a chooser in prose", () => {
  assert.deepEqual(accountChooser(page, undefined), { kind: "none" });
  assert.deepEqual(accountChooser({
    ...page,
    text: "The next step asks you to choose an account from the list.",
    items: [`[1] button "${wanted}"`],
  }, wanted), { kind: "none" });
});

test("picks the ref of the one exactly matching account", () => {
  const read = chooser(
    `[1] button "${other}"`,
    `[12] link "${wanted}" → https://example.com/select`,
    '[13] button "Use another account"',
  );
  assert.deepEqual(accountChooser(read, wanted), { kind: "pick", ref: "12" });
});

test("finds a standalone chooser prompt in the masked body text", () => {
  const read = {
    ...page,
    text: "Sign in\nPick an account\nContinue to the workspace",
    items: [`[4] button "${wanted}"`],
  };
  assert.deepEqual(accountChooser(read, wanted), { kind: "pick", ref: "4" });
});

test("ignores case and outer spaces on both sides of the match", () => {
  const read = chooser(`[7] button "  ${wanted.toUpperCase()}  "`);
  assert.deepEqual(accountChooser(read, ` ${wanted}\t`), { kind: "pick", ref: "7" });
});

test("holds when the wanted address is only part of an entry label", () => {
  assertHold(chooser(
    `[1] button "${wanted}.evil.test"`,
    `[2] button "Sample Profile ${wanted}"`,
  ), wanted, 2);
});

test("compares the serialized label independently of field values and link targets", () => {
  const read = chooser(
    `[1] field:text "${wanted}" = fixture`,
    `[2] link "${other}" → https://example.com/${wanted}`,
    '[3] button "Sample \\"Profile\\""',
  );
  assertHold(read, wanted, 2);
  assert.deepEqual(accountChooser(read, 'Sample "Profile"'), { kind: "pick", ref: "3" });
});

test("holds when two entries match the requested account", () => {
  assertHold(chooser(
    `[2] button "${wanted}"`,
    `[3] button " ${wanted.toUpperCase()} "`,
    `[4] button "${other}"`,
  ), wanted, 3);
});

test("holds when no listed account matches", () => {
  assertHold(chooser(`[1] button "${other}"`), wanted, 1);
});

test("holds when the requested account is missing or blank", () => {
  const read = chooser(`[1] button "${wanted}"`, `[2] button "${other}"`);
  assertHold(read, undefined, 2);
  assertHold(read, " \t ", 2);
});

test("holds when an account-management control is the only choice", () => {
  for (const label of [
    "Use another account",
    "Add account",
    "Sign in with a different account",
    "Remove an account",
    "שימוש בחשבון אחר",
    "הוספת חשבון",
    "כניסה באמצעות חשבון אחר",
    "הסרת חשבון",
  ]) {
    const item = `[1] button ${JSON.stringify(label)}`;
    assertHold(chooser(item), wanted, 0);
    assertHold(chooser(`[2] button "${other}"`, item), label, 1);
  }
  assertHold({ ...page, items: ['[1] button "Use another account"'] }, wanted, 0);
});

test("recognizes a Hebrew chooser prompt", () => {
  const read = {
    ...page,
    text: `בחירת חשבון\n${wanted}\nשימוש בחשבון אחר`,
    items: [`[4] button "${wanted}"`, '[5] button "שימוש בחשבון אחר"'],
  };
  assert.deepEqual(accountChooser(read, wanted), { kind: "pick", ref: "4" });
});

test("returns only a plain reason and count on hold without exposing account labels", () => {
  const otherName = "Fixture Secondary Profile";
  const result = assertHold(chooser(`[1] button "${other}"`, `[2] button "${otherName}"`), wanted, 2);
  assert.deepEqual(Object.keys(result).sort(), ["kind", "reason", "seen"]);
  const serialized = JSON.stringify(result);
  for (const label of [wanted, other, otherName]) {
    assert.ok(!serialized.includes(label), "the decision must omit fixture account labels");
  }
});
