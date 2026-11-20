import assert from "node:assert/strict";
import test from "node:test";
import { cleanProfileName } from "../src/pomelo/browser/profile-name.js";

test("profile names use NFC and single spaces", () => {
  assert.deepEqual(cleanProfileName("  Work   Chrome ", []), { ok: true, name: "Work Chrome" });
  assert.deepEqual(cleanProfileName("Cafe\u0301\t\u0085 Work", []), { ok: true, name: "Café Work" });
});

test("Hebrew and mixed names stay whole while controls are removed", () => {
  for (const name of ["עבודה", "בנק Work", "שָׁלוֹם"]) {
    assert.deepEqual(cleanProfileName(name, []), { ok: true, name });
  }
  assert.deepEqual(cleanProfileName("ב\u200Dנק\u202E Wo\u0000rk\u2069", []), { ok: true, name: "בנק Work" });
});

test("the 40th character keeps its surrogate pair or Hebrew marks", () => {
  const prefix = "Work ".repeat(7) + "Bank";
  for (const last of ["😀", "שָׁ"]) {
    assert.deepEqual(cleanProfileName(prefix + last + " More".repeat(4), []), {
      ok: true,
      name: prefix + last,
    });
  }
  assert.deepEqual(cleanProfileName("Work ".repeat(11) + " Bank", []), {
    ok: true,
    name: "Work ".repeat(8).trimEnd(),
  });
});

test("empty and non-text names are refused", () => {
  for (const name of ["", " \t\n\u00a0 ", "\u200D\u202E", null, 42]) {
    const result = cleanProfileName(name, []);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.trim());
  }
});

test("duplicates are refused after cleaning and Unicode case folding", () => {
  for (const [raw, existing] of [
    ["Work", "work "],
    ["עבודה", " עבודה "],
    ["Café Work", "CAFE\u0301  WORK"],
    ["Straße", "STRASSE"],
    ["Work ".repeat(11) + " Bank", "work ".repeat(8)],
  ]) {
    const result = cleanProfileName(raw, Object.freeze([existing]));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.trim());
  }
  assert.deepEqual(cleanProfileName("Work Home", ["Work"]), { ok: true, name: "Work Home" });
  assert.deepEqual(cleanProfileName("I Work", ["ı Work"]), { ok: true, name: "I Work" });
});

test("credential-shaped input is refused without echoing any canary", () => {
  const canary = "made-up-profile-canary";
  const tokenLike = "Z9_demo-".repeat(5);
  const emailLike = ["fixture", "example.invalid"].join("@");
  for (const [raw, value] of [
    ["Work op://vault/item/field", "op://vault/item/field"],
    [`Work ${tokenLike}`, tokenLike],
    [`Work password=${canary}`, canary],
    [`Work pass\u200Dword=${canary}`, canary],
    [`${"Work ".repeat(10)}TOKEN = ${canary}`, canary],
    [`${emailLike}:${canary}`, canary],
  ]) {
    const result = cleanProfileName(raw, []);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.trim());
    assert.equal(JSON.stringify(result).includes(value), false);
  }
});
