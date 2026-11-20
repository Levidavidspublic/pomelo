import assert from "node:assert/strict";
import test from "node:test";
import { findTicketTwins } from "../src/pomelo/ticket-twins.js";

test("unrelated tickets have no twins", () => {
  const draft = { key: "P0-81", title: "Check ticket twins", scope: "`src/pomelo/ticket-twins.ts`" };
  const existing = { key: "P0-82", title: "Check ticket links", scope: "`src/pomelo/ticket-link.ts`" };
  assert.deepEqual(findTicketTwins([draft], [existing]), []);
});

test("a different ticket reusing a key is named", () => {
  const draft = { key: "P0-81", title: "Check ticket twins", scope: "" };
  const existing = { key: "P0-81", title: "Check ticket links", scope: "" };
  assert.deepEqual(findTicketTwins([draft], [existing]), [
    { newKey: "P0-81", otherKey: "P0-81", reason: "Same key" },
  ]);
});

test("a shared test path matches across slash styles and ticket states", () => {
  const draft = { key: "P0-81", title: "Write a test", scope: "`test\\pomelo-x.test.ts`" };
  const existing = { key: "P0-82", title: "Check a rule", scope: "`test/pomelo-x.test.ts`", state: "done" };
  assert.deepEqual(findTicketTwins([draft], [existing]), [
    { newKey: "P0-81", otherKey: "P0-82", reason: "Shared file test/pomelo-x.test.ts" },
  ]);
});

test("a shared Pomelo source file is named once per ticket pair", () => {
  for (const path of ["src/pomelo/rule.ts", "src/client/pomelo/panel.tsx"]) {
    const draft = { key: "P0-81", title: "Draft the rule", scope: `\`${path}\` \`${path}\`` };
    const existing = { key: "P0-82", title: "Check the rule", scope: `\`${path}\``, state: "done" };
    assert.deepEqual(findTicketTwins([draft], [existing]), [
      { newKey: "P0-81", otherKey: "P0-82", reason: `Shared file ${path}` },
    ]);
  }
});

test("shared PATCHES.md and Friday files alone give no twins", () => {
  const scope = "`PATCHES.md` `src/claims.ts`";
  const draft = { key: "P0-81", title: "Record the first hook", scope };
  const existing = { key: "P0-82", title: "Record the second hook", scope };
  assert.deepEqual(findTicketTwins([draft], [existing]), []);
});

test("paths must be backticked and match exactly", () => {
  const draft = { key: "P0-81", title: "Draft a rule", scope: "src/pomelo/rule.ts `src/pomelo/Other.ts`" };
  const existing = { key: "P0-82", title: "Check a rule", scope: "`src/pomelo/rule.ts` `src/pomelo/other.ts`" };
  assert.deepEqual(findTicketTwins([draft], [existing]), []);
});

test("titles match after lower-casing and trimming outer spaces", () => {
  const draft = { key: "P0-81", title: "  CHECK Ticket Twins  ", scope: "" };
  const existing = { key: "P0-82", title: "Check ticket twins", scope: "" };
  assert.deepEqual(findTicketTwins([draft], [existing]), [
    { newKey: "P0-81", otherKey: "P0-82", reason: "Same title" },
  ]);
});

test("a ticket object cannot be its own twin", () => {
  const ticket = { key: "P0-81", title: "Check ticket twins", scope: "`src/pomelo/ticket-twins.ts`" };
  assert.deepEqual(findTicketTwins([ticket], [ticket]), []);
});

test("an empty or missing scope still allows key and title checks", () => {
  const draft = { key: "P0-81", title: "Check ticket twins" };
  const existing = { key: "P0-82", title: "Check ticket twins", scope: "" };
  assert.deepEqual(findTicketTwins([draft], [existing]), [
    { newKey: "P0-81", otherKey: "P0-82", reason: "Same title" },
  ]);
  assert.deepEqual(findTicketTwins([draft], [{ ...existing, key: "P0-81", title: "Check ticket links" }]), [
    { newKey: "P0-81", otherKey: "P0-81", reason: "Same key" },
  ]);
});

test("findings are sorted by new key and then other key", () => {
  const scope = "`test/pomelo-x.test.ts`";
  const drafts = [
    { key: "P0-82", title: "New second rule", scope },
    { key: "P0-81", title: "New first rule", scope },
  ];
  const existing = [
    { key: "P0-84", title: "Existing second rule", scope },
    { key: "P0-83", title: "Existing first rule", scope },
  ];
  const reason = "Shared file test/pomelo-x.test.ts";
  const expected = [
    { newKey: "P0-81", otherKey: "P0-83", reason },
    { newKey: "P0-81", otherKey: "P0-84", reason },
    { newKey: "P0-82", otherKey: "P0-83", reason },
    { newKey: "P0-82", otherKey: "P0-84", reason },
  ];
  assert.deepEqual(findTicketTwins(drafts, existing), expected);
  assert.deepEqual(findTicketTwins(drafts.toReversed(), existing.toReversed()), expected);
});
