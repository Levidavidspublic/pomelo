import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBranchState } from "../src/pomelo/branch-state.js";

const expected = "ticket/686-p0-110";
const options = { expected };
const oid = "# branch.oid 0123456789abcdef0123456789abcdef01234567";
const upstream = `# branch.upstream origin/${expected}`;

function status(head: string, ...lines: string[]): string {
  return [oid, `# branch.head ${head}`, ...lines, ""].join("\n");
}

test("the exact ticket branch is ready when ahead of its upstream", () => {
  const result = checkBranchState(status(expected, upstream, "# branch.ab +2 -0"), options);
  assert.deepEqual(result, {
    ok: true,
    verdict: "ready",
    head: expected,
    ahead: 2,
    behind: 0,
    reason: `Ready to commit on "${expected}".`,
  });
});

test("a detached HEAD is blocked", () => {
  const result = checkBranchState(status("(detached)"), options);
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "detached");
  assert.equal(result.head, "(detached)");
  assert.match(result.reason, /^Detached HEAD/);
});

test("main, the import branch, docs, and other ticket branches are blocked by name", () => {
  for (const head of ["main", "import/friday-v0.3.4", "docs/plan", "ticket/685-p0-110", "ticket/686-p0-109"]) {
    const result = checkBranchState(status(head), options);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "wrong_branch");
    assert.equal(result.head, head);
    assert.match(result.reason, /^Wrong branch/);
    assert.ok(result.reason.includes(head));
  }
});

test("a ticket branch behind its upstream is blocked even if it is also ahead", () => {
  for (const ahead of [0, 2]) {
    const result = checkBranchState(status(expected, upstream, `# branch.ab +${ahead} -3`), options);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "behind");
    assert.equal(result.ahead, ahead);
    assert.equal(result.behind, 3);
    assert.match(result.reason, /^Behind upstream by 3 commits\.$/);
  }
});

test("a fresh branch without an upstream is ready even with ordinary worktree entries", () => {
  const result = checkBranchState(status(expected, "? draft.txt"), options);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "ready");
  assert.equal(result.ahead, null);
  assert.equal(result.behind, null);
  assert.ok(!result.reason.includes("draft.txt"));
});

test("a porcelain v2 unmerged entry blocks a merge or a conflicted rebase without naming its path", () => {
  const conflict = `u UU N... 100644 100644 100644 100644 ${"a".repeat(40)} ${"b".repeat(40)} ${"c".repeat(40)} conflict.txt`;
  for (const head of [expected, "(detached)"]) {
    const result = checkBranchState(status(head, "? draft.txt", conflict), options);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "unmerged");
    assert.match(result.reason, /^Unmerged/);
    assert.ok(!result.reason.includes("conflict.txt"));
    assert.ok(!result.reason.includes("draft.txt"));
  }
});

test("initial, missing, or ambiguous branch headers are unreadable", () => {
  for (const input of [
    status(expected).replace(oid, "# branch.oid (initial)"),
    "",
    `${oid}\n? draft.txt\n`,
    `# branch.head ${expected}\n`,
    status(""),
    status(expected, "# branch.head main"),
  ]) {
    const result = checkBranchState(input, options);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "unreadable");
    assert.match(result.reason, /^Unreadable/);
  }
});

test("unavailable or malformed upstream counts cannot make a tracked branch ready", () => {
  for (const headers of [[], ["# branch.ab +? -?"], ["# branch.ab +2 -x"], ["# branch.ab +2 -9007199254740993"]]) {
    const result = checkBranchState(status(expected, upstream, ...headers), options);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "unreadable");
  }
});

test("CRLF line endings are accepted", () => {
  const input = status(expected, upstream, "# branch.ab +0 -0");
  assert.deepEqual(checkBranchState(input.replaceAll("\n", "\r\n"), options), checkBranchState(input, options));
  assert.equal(checkBranchState(input, options).verdict, "ready");
});

test("the expected branch must be a ticket branch name", () => {
  for (const name of ["", "main", "import/friday-v0.3.4", "docs/plan", "ticket/686"]) {
    const result = checkBranchState(status(name), { expected: name });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "unreadable");
    assert.match(result.reason, /expected ticket branch/);
  }
});
