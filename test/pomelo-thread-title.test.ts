import assert from "node:assert/strict";
import test from "node:test";
import { cleanThreadTitle } from "../src/pomelo/thread-title.js";

test("plain English, Hebrew and mixed titles pass unchanged", () => {
  for (const title of ["Plan the release", "תִּכְנוּן הפרויקט", "תִּכְנוּן release 2"]) {
    assert.deepEqual(cleanThreadTitle(title), { title, changed: false, reasons: [] });
  }
});

test("whitespace folds to one space and controls are removed", () => {
  const result = cleanThreadTitle(" \tתכנון\r\n  release\t\u0000\u202Eplan\u2069\u007F ");
  assert.equal(result.title, "תכנון release plan");
  assert.equal(result.changed, true);
  assert.ok(result.reasons.length > 0);
});

test("Markdown marks are removed at the edges", () => {
  assert.equal(cleanThreadTitle("## Plan **now**").title, "Plan **now");
  assert.equal(cleanThreadTitle("## __Plan now__ ##").title, "Plan now");
  assert.equal(cleanThreadTitle("C# issue #310").title, "C# issue #310");
});

test("a 200-character title becomes 79 characters and an ellipsis", () => {
  const title = "Plan now. ".repeat(19) + "Final plan";
  const result = cleanThreadTitle(title);
  assert.equal(title.length, 200);
  assert.equal(result.title, `${title.slice(0, 79)}…`);
  assert.equal(result.changed, true);
});

test("the length limit keeps joined emoji and Hebrew with niqqud whole", () => {
  const prefix = "א".repeat(78);
  for (const grapheme of ["👩🏽‍💻", "שָׁ"]) {
    const exact = `${prefix}${grapheme}ב`;
    const plain = { title: exact, changed: false, reasons: [] };
    assert.deepEqual(cleanThreadTitle(exact), plain);
    assert.equal(cleanThreadTitle(`${exact}ג`).title, `${prefix}${grapheme}…`);
    assert.equal(cleanThreadTitle(`${prefix}ב${grapheme}ג`).title, `${prefix}ב…`);
  }
});

test("standalone canary credentials are replaced in full", () => {
  const canary = "OnlyForTitleTest9".repeat(3);
  const candidates = [
    `sk-${canary}`,
    `ghp_${canary}`,
    `op://${["Example Vault", "Canary Entry", "field"].join("/")}`,
    `Bearer ${canary}`,
    "ab12".repeat(10),
    "Q2FuYXJ5LwQ8".repeat(3) + "YQ==",
    `glpat-${canary}`,
    `xoxb-${"test".repeat(3)}`,
    `eyJ${canary}.${canary}.${canary}`,
    `https://hooks.example.invalid/services/${canary}`,
    `-----BEGIN PRIVATE KEY-----\n${canary}\n-----END PRIVATE KEY-----`,
  ];
  for (const candidate of candidates) {
    const result = cleanThreadTitle(`__${candidate}__`);
    assert.equal(result.title, "[hidden]");
    assert.equal(result.changed, true);
    assert.ok(result.reasons.includes("secret"));
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
});

test("password values are hidden before the title is shortened", () => {
  const canary = ["fake", "pass", "for-test9"].join("-");
  assert.equal(cleanThreadTitle(`password=${canary}`).title, "password=[hidden]");
  assert.equal(cleanThreadTitle(`password: "${["fake", "phrase"].join(" ")}"`).title, "password: [hidden]");
  assert.equal(cleanThreadTitle(`__postgres://example:${canary}@localhost__`).title, "postgres://example:[hidden]@localhost");
  assert.equal(cleanThreadTitle("Password: reset plan").title, "Password: reset plan");

  const prefix = "א".repeat(70);
  const result = cleanThreadTitle(`${prefix} sk-${canary.repeat(4)}`);
  assert.equal(result.title, `${prefix} [hidden]`);
  assert.equal(JSON.stringify(result).includes(canary), false);
});

test("empty or stripped titles use a cleaned fallback", () => {
  for (const input of ["", "  \t  ", "## **"]) {
    const result = cleanThreadTitle(input, { fallback: "  Draft\tthread  " });
    assert.equal(result.title, "Draft thread");
    assert.equal(result.changed, true);
    assert.ok(result.reasons.includes("empty"));
  }
  assert.equal(cleanThreadTitle("").title, "New thread");
  assert.equal(cleanThreadTitle("", { fallback: " " }).title, "New thread");
  assert.equal(cleanThreadTitle("", { fallback: `sk-${"OnlyForTitleTest9".repeat(3)}` }).title, "[hidden]");
});

test("non-string inputs use the fallback without coercion", () => {
  assert.equal(cleanThreadTitle(undefined).title, "New thread");
  const object = {
    toString() {
      throw new Error("must not coerce the title");
    },
  };
  for (const input of [42, undefined, null, object]) {
    const result = cleanThreadTitle(input, { fallback: "Draft thread" });
    assert.equal(result.title, "Draft thread");
    assert.equal(result.changed, true);
    assert.ok(result.reasons.includes("non-string"));
  }
});
