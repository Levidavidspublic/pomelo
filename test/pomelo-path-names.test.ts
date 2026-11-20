import assert from "node:assert/strict";
import test from "node:test";
import { checkPathNames } from "../src/pomelo/path-names.js";

test("a case clash with the base names the added path and explains the conflict", () => {
  const added = "src/pomelo/Store.ts";
  const existing = "src/pomelo/store.ts";
  const result = checkPathNames([added], [existing]);

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, added);
  assert.equal(result.findings[0].kind, "case-clash");
  assert.ok(result.findings[0].reason.includes(existing));
  assert.match(result.findings[0].reason, /case/i);
});

test("two added paths with different folder case are both reported", () => {
  const first = "src/Pomelo/a.ts";
  const second = "src/pomelo/a.ts";
  const result = checkPathNames([second, first], []);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path, kind }) => [path, kind]), [
    [first, "case-clash"],
    [second, "case-clash"],
  ]);
  assert.ok(result.findings[0].reason.includes(second));
  assert.ok(result.findings[1].reason.includes(first));
});

test("Windows device names are reserved in both filenames and folders", () => {
  const paths = [
    "docs/aux.md", "src/pomelo/con.ts", "PRN/file.txt", "notes/Nul",
    "bin/com1.log", "COM9/sub/file", "out/lpt1", "out/LPT9.txt.bak",
  ];
  const result = checkPathNames(paths, []);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path }) => path), [...paths].sort());
  assert.ok(result.findings.every(({ kind, reason }) => kind === "reserved-name" && /reserved/i.test(reason)));
});

test("forbidden punctuation, backslashes, and controls are reported in any path part", () => {
  const paths = [
    "notes/what?.md", "a<b/c.ts", "a>b/c.ts", "a:b/c.ts", 'a"b/c.ts',
    "a|b/c.ts", "a*b/c.ts", "a\\b/c.ts", "a\tb/c.ts", "a\x00b/c.ts", "a\x7fb/c.ts",
  ];
  const result = checkPathNames(paths, []);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path }) => path), [...paths].sort());
  assert.ok(result.findings.every(({ kind, reason }) => kind === "bad-character" && /character/i.test(reason)));
});

test("a filename or folder ending with a dot or a space is reported", () => {
  const paths = ["a/b./c.ts", "a/b /c.ts", "notes/file.", "notes/file "];
  const result = checkPathNames(paths, []);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path }) => path), [...paths].sort());
  assert.ok(result.findings.every(({ kind, reason }) => kind === "trailing-dot-or-space" && /dot|space/i.test(reason)));
});

test("the whole path may be 240 characters long", () => {
  const atLimit = `docs/${"a".repeat(235)}`;
  const overLimit = `${atLimit}a`;
  const result = checkPathNames([atLimit, overLimit], []);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path, kind }) => [path, kind]), [[overLimit, "too-long"]]);
  assert.match(result.findings[0].reason, /240/);
});

test("NFC and NFD spellings clash with a reason about Unicode normalization", () => {
  const nfc = "docs/café.md";
  const nfd = nfc.normalize("NFD");
  const result = checkPathNames([nfd], [nfc]);

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, nfd);
  assert.equal(result.findings[0].kind, "case-clash");
  assert.match(result.findings[0].reason, /Unicode normalization/i);
});

test("findings are sorted by path and then by kind regardless of input order", () => {
  const added = ["z/what?.md", "a/CON./a.ts"];
  const existing = ["a/con./a.ts", "A/CON./a.ts"];
  const result = checkPathNames(added, existing);

  assert.deepEqual(result.findings.map(({ path, kind }) => [path, kind]), [
    ["a/CON./a.ts", "case-clash"],
    ["a/CON./a.ts", "reserved-name"],
    ["a/CON./a.ts", "trailing-dot-or-space"],
    ["z/what?.md", "bad-character"],
  ]);
  assert.deepEqual(checkPathNames([...added].reverse(), [...existing].reverse()), result);
});

test("empty additions return no findings even if the base has invalid paths", () => {
  assert.deepEqual(checkPathNames([], []), { ok: true, findings: [] });
  assert.deepEqual(checkPathNames([], ["docs/aux.md"]), { ok: true, findings: [] });
});

test("valid paths include Hebrew, other non-Latin names, and device name lookalikes", () => {
  const paths = ["docs/readme.md", "docs/שלום.md", "docs/日本語.md", "docs/auxiliary.md", "docs/com10.ts", "docs/lpt0.ts"];

  assert.deepEqual(checkPathNames(paths, ["docs/guide.md"]), { ok: true, findings: [] });
});
