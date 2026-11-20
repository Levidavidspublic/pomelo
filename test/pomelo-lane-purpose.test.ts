import assert from "node:assert/strict";
import test from "node:test";
import { cleanLanePurpose } from "../src/pomelo/lane-purpose.js";

test("keeps plain English, Hebrew and mixed text unchanged", () => {
  for (const purpose of ["Review the chart", "Keynote: review the chart", "בִּדְקוּ אֶת הַגְּרָף", "בדקו את Friday ואז את Pomelo"]) {
    assert.deepEqual(cleanLanePurpose(purpose), { purpose, changed: false, reasons: [] });
  }
});

test("trims and folds whitespace onto one line", () => {
  assert.deepEqual(cleanLanePurpose(" \tReview\r\n the\t  chart\u0085now  "), {
    purpose: "Review the chart now",
    changed: true,
    reasons: ["whitespace"],
  });
});

test("removes control and bidi characters while keeping Hebrew in order", () => {
  assert.deepEqual(cleanLanePurpose("בדקו\u0000 את \u202eFriday\u202c\u2067 עכשיו\u2069"), {
    purpose: "בדקו את Friday עכשיו",
    changed: true,
    reasons: ["controls"],
  });
});

test("keeps readable text from Markdown and HTML", () => {
  const raw = '## **Review**\n- [the chart](https://example.invalid) in <span title="a > b"><em>Friday</em></span> with `check_chart`';
  const result = cleanLanePurpose(raw);
  assert.equal(result.purpose, "Review the chart in Friday with check_chart");
  assert.equal(result.changed, true);
  assert.ok(result.reasons.includes("markup"));
});

test("hides a made-up token even when it straddles the cut or is split by markup", () => {
  const canary = `ghp_${"MadeUpCanary".repeat(3)}`;
  const prefix = "x".repeat(112) + " ";
  const splitAt = 10;
  for (const value of [canary, `${canary.slice(0, splitAt)}<b></b>${canary.slice(splitAt)}`]) {
    const result = cleanLanePurpose(`${prefix}${value} today`);
    assert.equal(result.purpose, `${prefix}•••• to`);
    assert.equal(result.changed, true);
    assert.ok(result.reasons.includes("secrets"));
    assert.ok(!result.purpose.includes(canary));
    assert.ok(result.reasons.every((reason) => !reason.includes(canary)));
  }
});

test("masks vault references and explicitly labeled credentials", () => {
  assert.equal(cleanLanePurpose("Find `op://Example Vault/Demo/password` now").purpose, "Find •••• now");
  assert.equal(cleanLanePurpose("Find op://Demo/Example/password now").purpose, "Find •••• now");
  assert.equal(cleanLanePurpose('Use password="made up canary" and api_key=demo and token=sample').purpose,
    'Use password="••••" and api_key=•••• and token=••••');
  assert.equal(cleanLanePurpose("Use **accessToken:** `made up canary` and DEMO_API_KEY=stub").purpose,
    "Use accessToken: •••• and DEMO_API_KEY=••••");
});

test("cuts a 300-character purpose to 120 graphemes", () => {
  assert.deepEqual(cleanLanePurpose("x".repeat(300)), {
    purpose: "x".repeat(120),
    changed: true,
    reasons: ["truncated"],
  });
});

test("keeps the final Hebrew letter with its vowel marks and joined emoji whole", () => {
  const prefix = "x".repeat(119);
  for (const grapheme of ["שָׁ", "👩🏽‍💻"]) {
    assert.deepEqual(cleanLanePurpose(`${prefix}${grapheme}`), {
      purpose: `${prefix}${grapheme}`, changed: false, reasons: [],
    });
    assert.equal(cleanLanePurpose(`${prefix}${grapheme}more`).purpose, `${prefix}${grapheme}`);
    assert.equal(cleanLanePurpose(`${prefix}x${grapheme}`).purpose, `${prefix}x`);
  }
});

test("falls back for empty or non-text input without coercing objects", () => {
  const object = { toString() { throw new Error("Objects must not be coerced"); } };
  for (const raw of ["", " \t ", "<b></b>", null, 42, object]) {
    const result = cleanLanePurpose(raw);
    assert.equal(result.purpose, "Sub-agent task");
    assert.equal(result.changed, true);
    assert.ok(result.reasons.includes("fallback"));
  }
});
