import assert from "node:assert/strict";
import test from "node:test";
import { checkSignedInAccount, type SignedInAccountInput } from "../src/pomelo/browser/wrong-account-stop.js";

const expected = "fixture.primary@example.invalid";
const other = "sample.secondary@example.invalid";
const same = { stop: false, match: "same" };
const unknown = { stop: false, match: "unknown" };

function mark(text: string, where = "account menu"): SignedInAccountInput["seen"][number] {
  return { text, where };
}

function assertWrongAccount(input: SignedInAccountInput) {
  const result = checkSignedInAccount(input);
  assert.equal(result.stop, true);
  assert.equal(result.status, "waiting");
  assert.equal(result.reason, "wrong_account");
  return result;
}

test("compares whole accounts after trimming, lowercasing, and Unicode normalization", () => {
  assert.deepEqual(checkSignedInAccount({ expected: ` ${expected}\t`, seen: [mark(`  ${expected.toUpperCase()}  `)] }), same);
  assert.deepEqual(checkSignedInAccount({ expected: "CAFÉ", seen: [mark("cafe\u0301")] }), same);
  assertWrongAccount({ expected: "fixture", seen: [mark("ｆixture")] });
});

test("returns unknown without a seen mark or expected account", () => {
  assert.deepEqual(checkSignedInAccount({ expected, seen: [] }), unknown);
  assert.deepEqual(checkSignedInAccount({ expected, seen: [mark(" \t ")] }), unknown);
  const seen = [mark(expected), mark(other, "header")];
  assert.deepEqual(checkSignedInAccount({ seen }), unknown);
  assert.deepEqual(checkSignedInAccount({ expected: " \t ", seen }), unknown);
});

test("holds for a different address, another domain, an extra dot, or a partial name match", () => {
  for (const text of [other, "fixture.primary@other.invalid", "fixture..primary@example.invalid"]) {
    assertWrongAccount({ expected, seen: [mark(text)] });
  }
  assertWrongAccount({ expected: "fixture", seen: [mark("fixture secondary", "profile badge")] });
});

test("holds for two distinct accounts and accepts repeated marks for the same account", () => {
  const wanted = mark(expected, "header");
  const repeated = mark(` ${expected.toUpperCase()} `, "profile badge");
  assert.deepEqual(checkSignedInAccount({ expected, seen: [wanted, repeated] }), same);
  const wrong = mark(other);
  for (const seen of [[wanted, wrong], [wrong, wanted], [wrong, mark("third fixture")]]) {
    const result = assertWrongAccount({ expected, seen });
    assert.match(result.card.body, /more than one account/i);
  }
});

test("holds for Amit with only the shortened account, three answers, and four forbidden actions", () => {
  const whereCanary = 'SYNTHETIC_LOCATION_"\\\n';
  const extraCanary = 'SYNTHETIC_EXTRA_"\\\t';
  const seen = [{ text: other, where: whereCanary, extra: extraCanary }];
  const result = assertWrongAccount({ expected, seen });
  assert.match(result.card.body, /Amit/);
  assert.ok(result.card.body.includes("s…@example.invalid"));
  assert.deepEqual(result.card.allowedAnswers, ["I switched it myself", "Carry on in this account", "Cancel the job"]);
  assert.deepEqual(result.forbiddenActions, ["switch_account", "sign_out", "add_account", "broker_fill"]);
  const serialized = JSON.stringify(result);
  for (const value of [expected, other, whereCanary, extraCanary]) {
    assert.ok(!serialized.includes(value));
    assert.ok(!serialized.includes(JSON.stringify(value).slice(1, -1)));
  }
});

test("compares whole Hebrew names and shows only the first character when holding", () => {
  const wanted = "משתמש בדיקה";
  const different = "משתמש בדיקה נוסף";
  assert.deepEqual(checkSignedInAccount({ expected: wanted, seen: [mark(` ${wanted} `)] }), same);
  const result = assertWrongAccount({ expected: wanted, seen: [mark(different)] });
  assert.ok(result.card.body.includes("מ…"));
  assert.ok(!JSON.stringify(result).includes(different));
});

test("holds with a fixed reason when input or marks are malformed", () => {
  const canary = 'SYNTHETIC_MALFORMED_"\\\n';
  for (const input of [
    null, canary, [], {}, { expected: false, seen: [] }, { expected: null, seen: [] },
    { expected, seen: true }, { expected, seen: [null] }, { expected, seen: [{ where: "header", text: 7 }] },
    { expected, seen: [{ text: canary }] }, { expected, seen: [{ text: canary, where: 7 }] },
    { seen: [canary] }, { expected, seen: [, mark(expected)] },
    { get seen() { throw new Error(canary); } },
  ]) {
    const result = checkSignedInAccount(input);
    assert.equal(result.stop, true);
    assert.equal(result.status, "waiting");
    assert.equal(result.reason, "bad_input");
    assert.match(result.card.body, /could not read.*Amit/i);
    assert.ok(!JSON.stringify(result).includes(JSON.stringify(canary).slice(1, -1)));
  }
});
