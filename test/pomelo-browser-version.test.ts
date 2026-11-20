import assert from "node:assert/strict";
import test from "node:test";
import { checkBrowserVersion } from "../src/pomelo/browser/version-match.js";

const newProfile = { profileId: "fixture-profile", home: "pc" } as const;
const profile = { ...newProfile, lastWrittenBy: "131.0.6778.33" };
const runner = { version: "131.0.6778.33", where: "pc" } as const;

test("a new profile opens with a readable runner version", () => {
  assert.equal(checkBrowserVersion(newProfile, runner).verdict, "open");
});

test("the same major opens even when the remaining parts are lower", () => {
  const result = checkBrowserVersion(profile, { ...runner, version: "131.0.6700.1" });
  assert.equal(result.verdict, "open");
});

for (const major of [132, 134]) {
  test(`runner major +${major - 131} opens and explains the upgrade`, () => {
    const result = checkBrowserVersion(profile, { ...runner, version: `${major}.0.1.0` });
    assert.equal(result.verdict, "open");
    assert.match(result.reason, /profile will be upgraded/i);
  });
}

test("runner major +4 holds for Amit's confirmation", () => {
  const result = checkBrowserVersion(profile, { ...runner, version: "135.0.1.0" });
  assert.equal(result.verdict, "hold");
  assert.ok(result.card?.title);
  assert.match(result.card.body, /last used by a much older browser/i);
  assert.match(result.card.body, /Amit.*confirm/i);
});

for (const where of ["pc", "vps"] as const) {
  test(`an older runner refuses and asks for a browser update on the ${where.toUpperCase()}`, () => {
    const home = where === "pc" ? "vps" : "pc";
    const result = checkBrowserVersion({ ...profile, home }, { where, version: "130.0.1.0" });
    assert.equal(result.verdict, "refuse");
    assert.match(result.reason, /\b130\b/);
    assert.match(result.reason, /\b131\b/);
    assert.match(result.reason, /damage/i);
    assert.match(result.reason, new RegExp(`update.*the ${where.toUpperCase()}\\b`, "i"));
  });
}

for (const [description, version] of [
  ["garbled text", "unknown"],
  ["an empty string", ""],
  ["three components", "131.0.6778"],
  ["a letter in a component", "131.0.6778.3a"],
  ["a trailing newline", "131.0.6778.33\n"],
] as const) {
  test(`${description} on either side holds with the unreadable-version reason`, () => {
    const expected = { verdict: "hold", reason: "The browser version could not be read" };
    assert.deepEqual(checkBrowserVersion({ ...profile, lastWrittenBy: version }, runner), expected);
    assert.deepEqual(checkBrowserVersion(profile, { ...runner, version }), expected);
  });
}

test("a new profile holds when the runner version cannot be read", () => {
  const result = checkBrowserVersion(newProfile, { ...runner, version: "" });
  assert.equal(result.verdict, "hold");
  assert.equal(result.reason, "The browser version could not be read");
});

test("the major comparison stays exact beyond the safe integer range", () => {
  const result = checkBrowserVersion(
    { ...profile, lastWrittenBy: "9007199254740993.0.0.0" },
    { ...runner, version: "9007199254740992.0.0.0" },
  );
  assert.equal(result.verdict, "refuse");
});

test("running on a different machine preserves the verdict and names both machines on the card", () => {
  for (const version of ["130.0.1.0", "131.0.1.0", "132.0.1.0", "135.0.1.0", "unknown"]) {
    const local = checkBrowserVersion(profile, { ...runner, version });
    const remote = checkBrowserVersion(profile, { version, where: "vps" });
    assert.equal(remote.verdict, local.verdict);
    assert.ok(remote.card?.title);
    assert.match(remote.card.body, /profile lives on the PC\b/i);
    assert.match(remote.card.body, /browser would run on the VPS\b/i);
    if (local.card) assert.ok(remote.card.body.includes(local.card.body));
  }
});

test("reason and card text never include a slash-separated profile path", () => {
  const path = "/fixture/browser/profile";
  const profileWithPath = { ...profile, profileId: path, profilePath: path };
  for (const version of [path, "130.0.1.0", "131.0.1.0", "132.0.1.0", "135.0.1.0"]) {
    const result = checkBrowserVersion(profileWithPath, { where: "vps", version });
    assert.doesNotMatch(JSON.stringify(result), /\//);
  }
  const result = checkBrowserVersion({ ...profileWithPath, lastWrittenBy: path }, runner);
  assert.doesNotMatch(JSON.stringify(result), /\//);
});
