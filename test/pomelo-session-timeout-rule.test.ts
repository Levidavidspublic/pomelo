import assert from "node:assert/strict";
import test from "node:test";
import { sessionTimeoutRule } from "../src/pomelo/browser/session-timeout-rule.js";

const warning = { title: "Your session is about to expire" };
const stay = { label: "Stay signed in" };

test("selects an exact stay label for each English timeout prompt", () => {
  for (const [text, label] of [
    ["Your session is about to expire.", "Stay signed in"],
    ["You will be signed out in 30 seconds.", "Continue session"],
    ["Are you still there?", "Keep me signed in"],
    ["Still working?", "I’m still here"],
    ["Are you still there?", "EXTEND  SESSION"],
  ]) {
    const decision = sessionTimeoutRule({ text, buttons: [{ label }] });
    assert.equal(decision.action, "press");
    assert.equal(decision.label, label);
  }
});

test("recognizes Hebrew timeout wording and stay labels", () => {
  for (const [text, label] of [
    ["תוקף החיבור שלך עומד לפוג.", "הישאר מחובר"],
    ["האם את עדיין שם?", "אני עדיין כאן"],
    ["ההפעלה שלך עומדת להסתיים.", "המשך את ההפעלה"],
    ["תנותק מהחשבון בעוד דקה.", "השאר אותי מחובר"],
    ["עדיין עובדים?", "הארך את החיבור"],
  ]) {
    const decision = sessionTimeoutRule({ text, buttons: [label] });
    assert.equal(decision.action, "press");
    assert.equal(decision.label, label);
  }
});

test("reads numbered buttons and counts a mirrored button once", () => {
  for (const item of ['[4] button "Stay signed in"', '[4] field:submit "Stay signed in" = ••••']) {
    for (const buttons of [[], [stay]]) {
      const decision = sessionTimeoutRule({ ...warning, buttons, items: [item] });
      assert.equal(decision.action, "press");
      assert.equal(decision.label, stay.label);
    }
  }
});

test("selects only the stay button when the prompt also offers to end the session", () => {
  for (const label of ["Sign out", "Log out", "End session", "Leave"]) {
    const end = { label };
    const decision = sessionTimeoutRule({ ...warning, buttons: [stay, end] });
    assert.equal(decision.action, "press");
    assert.equal(decision.label, stay.label);
    const endOnly = sessionTimeoutRule({ ...warning, buttons: [end] });
    assert.equal(endOnly.action, "hold");
    assert.equal(endOnly.label, undefined);
  }
});

test("holds for Amit when the prompt asks for a password", () => {
  for (const prompt of [
    { items: ['[1] field:password "Stay signed in" = ••••'] },
    { fields: [{ type: "password", value: "••••" }] },
    { text: "Confirm your password to continue." },
    { text: "יש להזין את הסיסמה שלך שוב כדי להמשיך." },
  ]) {
    const decision = sessionTimeoutRule({ ...warning, buttons: [stay], ...prompt });
    assert.equal(decision.action, "hold");
    assert.equal(decision.label, undefined);
    assert.match(decision.reason, /password.*Amit/i);
  }
});

test("holds when more than one control qualifies as a stay button", () => {
  for (const controls of [
    { buttons: [stay, { label: "Continue session" }] },
    { buttons: [stay, stay] },
    { buttons: [stay], items: ['[1] button "Stay signed in"', '[2] button "Stay signed in"'] },
    { buttons: [stay], items: ['[1] button "Extend session"'] },
  ]) {
    const decision = sessionTimeoutRule({ ...warning, ...controls });
    assert.equal(decision.action, "hold");
    assert.equal(decision.label, undefined);
  }
});

test("holds when the available choices contain no clear stay button", () => {
  for (const controls of [
    { buttons: [{ label: "Continue" }, { label: "Stay signed in and subscribe" }] },
    { items: ['[1] link "Stay signed in" → /account', '[2] field:text "Continue session"'] },
    { buttons: [{ ...stay, disabled: true }], items: ['[1] button "Stay signed in"'] },
  ]) {
    const decision = sessionTimeoutRule({ ...warning, ...controls });
    assert.equal(decision.action, "hold");
    assert.equal(decision.label, undefined);
  }
});

test("uses the job's extension count and limit", () => {
  const read = { ...warning, buttons: [stay] };
  assert.equal(sessionTimeoutRule(read, { extendedCount: 2 }).action, "press");
  assert.equal(sessionTimeoutRule(read, { extendedCount: 3 }).action, "hold");
  assert.equal(sessionTimeoutRule(read, { extendedCount: 3, maxExtends: 4 }).action, "press");
  assert.equal(sessionTimeoutRule(read, { maxExtends: 0 }).action, "hold");
});

test("defers an ended session to the signed-out stop rule", () => {
  for (const text of ["Your session has expired.", "You have been signed out.", "פג תוקף החיבור שלך."]) {
    const decision = sessionTimeoutRule({ ...warning, text, buttons: [stay] });
    assert.equal(decision.action, "go");
    assert.equal(decision.label, undefined);
    assert.ok(decision.signals.includes("defer-to-signed-out"));
  }
});

test("goes through an ordinary page without a timeout prompt", () => {
  const decision = sessionTimeoutRule({ title: "Garden guide", text: "Still working on the garden.", buttons: ["Continue"] });
  assert.equal(decision.action, "go");
  assert.equal(decision.label, undefined);
  assert.deepEqual(decision.signals, []);
});

test("holds on a missing, empty or unreadable page read", () => {
  for (const read of [undefined, null, {}, "unreadable", { text: "\n " }, { ...warning, items: [null] }]) {
    const decision = sessionTimeoutRule(read);
    assert.equal(decision.action, "hold");
    assert.equal(decision.label, undefined);
  }
});

test("keeps page copy and numbered field values out of the decision", () => {
  const marker = "SYNTHETIC_TIMEOUT_PAGE_MARKER";
  for (const buttons of [[stay], [], [{ label: `Stay signed in ${marker}` }]]) {
    const decision = sessionTimeoutRule({
      ...warning, text: marker, buttons, items: [`[2] field:text "Notes" = ${marker}`],
    });
    assert.equal(decision.action, buttons[0] === stay ? "press" : "hold");
    assert.ok(!JSON.stringify(decision).includes(marker));
  }
});
