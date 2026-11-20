import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("the README starts with the Pomelo heading", () => {
  assert.equal(readme.trimStart().split(/\r?\n/, 1)[0]?.trimEnd(), "# Pomelo");
});

test("the README credits MIT-licensed Friday and links to upstream", () => {
  assert.match(readme, /\bfork of Friday\b[^\r\n]*\bMIT\b/i);
  assert.match(readme, /\]\(https:\/\/github\.com\/splashxmoon\/friday\)/);
});

test("the README omits upstream release downloads and the upstream npx command", () => {
  assert.doesNotMatch(readme, /releases\/latest\/download/i);
  assert.doesNotMatch(readme, /\bnpx\s+github:splashxmoon\/friday\b/i);
});
