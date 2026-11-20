import assert from "node:assert/strict";
import test from "node:test";
import { checkStashes } from "../src/pomelo/stash-list.js";

const opts = {
  ownBranch: "ticket/710-p0-113",
  claimedBranches: ["ticket/710-p0-113", "ticket/697-p0-112"],
};

test("an empty stash list is clean", () => {
  const result = checkStashes("", opts);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.stashes, []);
});

test("an own stash is a leftover even when its branch is claimed", () => {
  const result = checkStashes("stash@{0}: WIP on ticket/710-p0-113: abc1234 some message\n", opts);
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "leftovers");
  assert.deepEqual(result.stashes, [
    { index: 0, branch: opts.ownBranch, kind: "own", message: "abc1234 some message" },
  ]);
});

test("a stash on another live worker's branch leaves the list clean", () => {
  const result = checkStashes("stash@{1}: On ticket/697-p0-112: my note", opts);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.stashes, [
    { index: 1, branch: "ticket/697-p0-112", kind: "live", message: "my note" },
  ]);
});

test("a stash on an unclaimed ticket branch is a leftover", () => {
  const result = checkStashes("stash@{0}: On ticket/697-p0-112: draft", { ...opts, claimedBranches: [] });
  assert.equal(result.verdict, "leftovers");
  assert.deepEqual(result.stashes, [
    { index: 0, branch: "ticket/697-p0-112", kind: "orphan", message: "draft" },
  ]);
});

test("protected branches and stashes with no branch are unknown leftovers", () => {
  const result = checkStashes([
    "stash@{0}: On main: draft",
    "stash@{1}: On import/friday-v0.3.4: draft",
    "stash@{2}: WIP on (no branch): abc1234 draft",
    "stash@{3}: On : draft",
  ].join("\n"), { ...opts, claimedBranches: ["main", "import/friday-v0.3.4"] });
  assert.equal(result.verdict, "leftovers");
  assert.deepEqual(result.stashes, [
    { index: 0, branch: "main", kind: "unknown", message: "draft" },
    { index: 1, branch: "import/friday-v0.3.4", kind: "unknown", message: "draft" },
    { index: 2, branch: null, kind: "unknown", message: "abc1234 draft" },
    { index: 3, branch: null, kind: "unknown", message: "draft" },
  ]);
});

test("a caller can designate a protected branch", () => {
  const result = checkStashes("stash@{0}: On ticket/697-p0-112: draft", {
    ...opts, protectedBranches: ["ticket/697-p0-112"],
  });
  assert.equal(result.verdict, "leftovers");
  assert.equal(result.stashes[0].kind, "unknown");
});

test("preserves slash paths, message delimiters, and indexes in CRLF output", () => {
  const branch = "ticket/697-p0-112/follow-up";
  const result = checkStashes([
    `stash@{9}: On ${branch}: draft: On the next step`,
    "stash@{10}: On topic/follow-up: draft",
    "",
  ].join("\r\n"), opts);
  assert.equal(result.verdict, "leftovers");
  assert.deepEqual(result.stashes, [
    { index: 9, branch, kind: "orphan", message: "draft: On the next step" },
    { index: 10, branch: "topic/follow-up", kind: "unknown", message: "draft" },
  ]);
});

test("a stash with an empty subject can still be named", () => {
  const result = checkStashes("stash@{0}: On ticket/710-p0-113:\n", opts);
  assert.deepEqual(result.stashes, [
    { index: 0, branch: opts.ownBranch, kind: "own", message: "" },
  ]);
});

test("non-string input and unsupported lines are unreadable", () => {
  for (const input of [null, 123, [], "unexpected output", "stash@{0}: Saved a draft", "stash@{0}: On draft"]) {
    const result = checkStashes(input, opts);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "unreadable");
    assert.deepEqual(result.stashes, []);
  }
});

test("unreadable lines block the check while readable entries are still named", () => {
  const result = checkStashes("stash@{0}: Saved a draft\nstash@{1}: On ticket/710-p0-113: draft\n", opts);
  assert.equal(result.verdict, "unreadable");
  assert.match(result.reason, /line 1/);
  assert.deepEqual(result.stashes, [
    { index: 1, branch: opts.ownBranch, kind: "own", message: "draft" },
  ]);
});

test("only a short prefix of a stash message appears anywhere in the result", () => {
  const preview = "x".repeat(64);
  const tail = "discard this example suffix";
  const result = checkStashes(`stash@{0}: On ticket/710-p0-113: ${preview}${tail}\n${tail}`, opts);
  assert.equal(result.verdict, "unreadable");
  assert.equal(result.stashes[0].message, preview);
  assert.ok(!JSON.stringify(result).includes(tail));
});
