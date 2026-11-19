import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LICENSE retains Friday's original copyright line", () => {
  const license = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
  assert.match(license, /^Copyright \(c\) 2026 Arun Dass\r?$/m);
});

test("THIRD-PARTY-NOTICES.md records the licences and Rakazo's NOTICE", () => {
  const notices = readFileSync(new URL("../THIRD-PARTY-NOTICES.md", import.meta.url), "utf8");
  assert.match(notices, /^## Friday \(MIT\)\r?$/m);
  assert.match(notices, /^## Rakazo \(Apache-2\.0 \+ NOTICE\)\r?$/m);
  assert.match(notices, /^## Playwright \(Apache-2\.0\)\r?$/m);
});

test("PATCHES.md records the ledger columns and all three rebase rules", () => {
  const patches = readFileSync(new URL("../PATCHES.md", import.meta.url), "utf8");
  assert.match(patches, /^\| File \| Hook \| Reason \| Ticket \|\r?\n\| -{3,} \| -{3,} \| -{3,} \| -{3,} \|\r?$/m);

  const rules = [
    "1. New code lives in `src/pomelo/**` and `src/client/pomelo/**`.",
    "2. Edits to Friday files are small hooks, each listed in `PATCHES.md` with the reason.",
    "3. A weekly job rebases onto upstream's newest tag in a branch and opens a PR. It never pushes to main.",
  ];
  const lines = patches.split(/\r?\n/);
  for (const rule of rules) {
    assert.ok(lines.includes(rule), `Expected PATCHES.md to contain "${rule}"`);
  }
});
