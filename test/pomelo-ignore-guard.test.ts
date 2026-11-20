import assert from "node:assert/strict";
import test from "node:test";
import { checkIgnoreChange, PROTECTED_IGNORE_PATTERNS } from "../src/pomelo/ignore-guard.js";

const fridayIgnore = "node_modules/\n.DS_Store\n*.log\n.env\ndist/\nrelease/\n";

test("accepts unchanged ignore text", () => {
  assert.deepEqual(checkIgnoreChange(fridayIgnore, fridayIgnore), []);
});

test("reports a removed protected pattern at its base line", () => {
  assert.deepEqual(checkIgnoreChange(fridayIgnore, fridayIgnore.replace(".env\n", "")), [
    { kind: "removed-protected", line: 4, pattern: ".env" },
  ]);
});

test("reports a new negation at its head line", () => {
  assert.deepEqual(checkIgnoreChange(fridayIgnore, `${fridayIgnore}\n!.env\n`), [
    { kind: "negation-added", line: 8, pattern: "!.env" },
  ]);
});

test("treats commenting out a protected pattern as removal", () => {
  assert.deepEqual(checkIgnoreChange(fridayIgnore, `# ${fridayIgnore}`), [
    { kind: "removed-protected", line: 1, pattern: "node_modules/" },
  ]);
});

test("protects the listed patterns once present in the base", () => {
  const patterns = ["node_modules/", ".env", "*.log", "dist/", "release/", "profiles/", "artifacts/"];
  assert.deepEqual(PROTECTED_IGNORE_PATTERNS, patterns);
  assert.deepEqual(checkIgnoreChange(patterns.join("\n"), ".DS_Store\n"), patterns.map((pattern, index) => ({
    kind: "removed-protected",
    line: index + 1,
    pattern,
  })));
});

test("accepts added ignore patterns, comments and escaped negations", () => {
  assert.deepEqual(checkIgnoreChange(fridayIgnore, `${fridayIgnore}coverage/\nprofiles/\nartifacts/\n#!.env\n\\!.env\n`), []);
});

test("accepts reordered lines and keeps existing negations", () => {
  assert.deepEqual(checkIgnoreChange("node_modules/\n!.env\n.env\ndist/\n", "dist/\n!.env\n.env\nnode_modules/\n"), []);
});

test("handles a UTF-8 BOM, CRLF and insignificant trailing spaces", () => {
  assert.deepEqual(checkIgnoreChange("\uFEFF.env  \r\n\r\n!.sample\r\n", ".env\n!.sample  \n"), []);
});

test("preserves significant spaces in patterns", () => {
  assert.deepEqual(checkIgnoreChange(".env\n", " .env\n"), [
    { kind: "removed-protected", line: 1, pattern: ".env" },
  ]);
  assert.deepEqual(checkIgnoreChange("!sample\n", "!sample\\   \n"), [
    { kind: "negation-added", line: 1, pattern: "!sample\\ " },
  ]);
});

test("reports extra negation occurrences and missing protected occurrences", () => {
  assert.deepEqual(checkIgnoreChange(".env\n!.env\n.env\n", ".env\n!.env\n!.env\n"), [
    { kind: "removed-protected", line: 3, pattern: ".env" },
    { kind: "negation-added", line: 3, pattern: "!.env" },
  ]);
});

test("reports one unreadable finding for empty or non-string inputs", () => {
  const unreadable = [{ kind: "unreadable", line: 0, pattern: "" }];
  for (const input of ["", " \r\n", null, undefined, 42, {}]) {
    assert.deepEqual(checkIgnoreChange(input, fridayIgnore), unreadable);
    assert.deepEqual(checkIgnoreChange(fridayIgnore, input), unreadable);
  }
  assert.deepEqual(checkIgnoreChange(null, ""), unreadable);
});
