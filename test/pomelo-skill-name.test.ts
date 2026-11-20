import assert from "node:assert/strict";
import test from "node:test";
import { browserSkillName } from "../src/pomelo/browser/skill-name.js";

const validSlug = /^[a-z0-9][a-z0-9-]{0,39}$/;
const windowsDevice = /^(?:con|prn|aux|nul|conin|conout|(?:com|lpt)[1-9])$/;

function check(raw: unknown, existingSlugs: readonly string[] | ReadonlySet<string> = []) {
  const result = browserSkillName(raw, existingSlugs);
  assert.match(result.slug, validSlug);
  assert.doesNotMatch(result.slug, windowsDevice);
  assert.ok([...existingSlugs].every((slug) => slug.toLowerCase() !== result.slug));
  assert.equal(result.changed, result.reasons.length > 0);
  return result;
}

test("a plain name keeps its display spelling and gets a lowercase slug", () => {
  assert.deepEqual(check("Open Dashboard"), {
    name: "Open Dashboard",
    slug: "open-dashboard",
    changed: false,
    reasons: [],
  });
});

test("Hebrew stays intact and an all-Hebrew name gets a steady hash slug", () => {
  const name = "בְּדִיקַת הַדַּף";
  const result = check(name);
  assert.equal(result.name, name);
  assert.match(result.slug, /^skill-[a-f0-9]{6,16}$/);
  assert.equal(check(name).slug, result.slug);
  assert.notEqual(check("דף אחר").slug, result.slug);

  const mixed = check(`${name} Dashboard בעברית Today`);
  assert.equal(mixed.name, `${name} Dashboard בעברית Today`);
  assert.equal(mixed.slug, "dashboard-today");
});

test("the display name loses markup, line breaks, controls and bidi marks", () => {
  const result = check(" \t<b title='x > y'>Open</b><!-- draft -->\r\n**דַּף**\u202E\u0000\u200F\u2069\u2028`n\u200Bow` ");
  assert.equal(result.name, "Open דַּף now");
  assert.equal(result.slug, "open-now");
  assert.equal(result.changed, true);
});

test("path pieces and Windows device names get safe slugs", () => {
  assert.equal(check("../x").slug, "x");
  assert.equal(check("a/b\\c").slug, "a-b-c");
  assert.match(check("...").slug, /^skill-/);
  for (const name of ["CON", "nul", "AUX", "COM1", "LPT9", "CONOUT$"]) {
    assert.equal(check(name).name, name);
  }
});

test("the 60th grapheme stays whole for Hebrew marks and joined emoji", () => {
  const prefix = "a".repeat(59);
  for (const last of ["שָׁ", "👩‍💻"]) {
    const result = check(prefix + last + "z".repeat(141 - last.length));
    assert.equal(result.name, prefix + last);
    assert.equal(result.slug, "a".repeat(40));
    assert.equal(result.changed, true);
  }
});

test("clashes use the first free suffix, ignoring case and fitting the 40-character limit", () => {
  assert.equal(check("Read page", ["read-page"]).slug, "read-page-2");
  assert.equal(check("Read page", new Set(["READ-PAGE", "Read-Page-2"])).slug, "read-page-3");
  assert.equal(check("Read page", ["read-page", "read-page-3"]).slug, "read-page-2");
  const taken = ["a".repeat(40), ...Array.from({ length: 8 }, (_, index) => `${"a".repeat(38)}-${index + 2}`)];
  assert.equal(check("a".repeat(50), Object.freeze(taken)).slug, `${"a".repeat(37)}-10`);
});

test("a synthetic token is hidden before the slug is made or the name is shortened", () => {
  const payload = "z9".repeat(20);
  const token = `sk-${payload}`;
  const prefix = "a".repeat(53);
  for (const raw of [`${prefix} ${token} more`, `${prefix} sk-<b>${payload}</b> more`]) {
    const result = check(raw);
    assert.equal(result.name, `${prefix} •••• m`);
    assert.equal(result.changed, true);
    assert.equal(JSON.stringify(result).includes(payload), false);
  }
  const result = check(`Open ${token}`);
  assert.equal(result.name, "Open ••••");
  assert.equal(result.slug, "open");
  assert.equal(JSON.stringify(result.reasons).includes(token), false);
});

test("passwords, labeled keys and tokens, and vault paths are masked", () => {
  const sample = "fictional-value";
  for (const input of [
    `Open password="${sample} with spaces"`,
    `Open password="${sample} with spaces`,
    `Open token: ${sample}`,
    `Open API key=${sample}`,
    `Open op://Fixture/Item/${sample}`,
    `Open op://Fixture/Item/field]${sample}`,
    `Open "OP://Fixture Vault/Example/${sample}"`,
    `Open [op://Fixture/Item/${sample}](https://example.invalid)`,
  ]) {
    const result = check(input);
    assert.match(result.name, /••••/);
    assert.equal(JSON.stringify(result).includes(sample), false);
    assert.doesNotMatch(JSON.stringify(result), /op:\/\//i);
  }
  assert.equal(check("Open password=fake(value)&pieces").name, "Open password=••••");
});

test("empty and nonstring names use the same default without coercion", () => {
  const unreadable = { toString() { throw new Error("unexpected coercion"); } };
  for (const raw of ["", "  \t\n ", null, 42, unreadable]) {
    const result = check(raw);
    assert.equal(result.name, "Browser skill");
    assert.equal(result.slug, "browser-skill");
    assert.equal(result.changed, true);
  }
  assert.equal(check(null, ["BROWSER-SKILL"]).slug, "browser-skill-2");
});
