import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPushRefs } from "../src/pomelo/push-refs.js";

const ticket = { number: 600, key: "P0-95" };
const ownRef = "refs/heads/ticket/600-p0-95";
const remote = "To https://example.invalid/pomelo.git";

function porcelain(...lines: string[]): string {
  return [remote, ...lines, "Done", ""].join("\n");
}

test("a new branch at the ticket's exact destination is allowed", () => {
  assert.deepEqual(checkPushRefs(porcelain(`*\tHEAD:${ownRef}\t[new branch]`), ticket), {
    ok: true,
    problems: [],
  });
});

test("a fast-forward to the ticket branch is allowed with CRLF line endings", () => {
  const text = porcelain(` \t${ownRef}:${ownRef}\t123abcd..456abcd`).replaceAll("\n", "\r\n");
  assert.deepEqual(checkPushRefs(text, ticket), { ok: true, problems: [] });
});

test("tags are blocked", () => {
  const ref = "refs/tags/v1.0.0";
  const result = checkPushRefs(porcelain(`*\t${ref}:${ref}\t[new tag]`), ticket);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ ref, kind }) => ({ ref, kind })), [{ ref, kind: "tag" }]);
});

test("main and branches under import, docs, and config are protected", () => {
  for (const branch of ["main", "import/friday-v0.3.4", "docs/plan", "config/kitchen"]) {
    const ref = `refs/heads/${branch}`;
    const result = checkPushRefs(porcelain(` \t${ownRef}:${ref}\t123abcd..456abcd`), ticket);
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map(({ ref, kind }) => ({ ref, kind })), [{ ref, kind: "protected-branch" }]);
  }
});

test("a different ticket number or key is blocked", () => {
  for (const branch of ["ticket/601-p0-95", "ticket/600-p0-96", "topic/example"]) {
    const ref = `refs/heads/${branch}`;
    const result = checkPushRefs(porcelain(`*\t${ownRef}:${ref}\t[new branch]`), ticket);
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map(({ ref, kind }) => ({ ref, kind })), [{ ref, kind: "other-branch" }]);
  }
});

test("the delete flag and an empty source each block a push", () => {
  const text = porcelain(`-\t${ownRef}:${ownRef}\t[deleted]`, ` \t:${ownRef}\t[deleted]`);
  const result = checkPushRefs(text, ticket);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ ref, kind }) => ({ ref, kind })), [
    { ref: ownRef, kind: "delete" },
    { ref: ownRef, kind: "delete" },
  ]);
});

test("a force push is blocked even on the ticket branch", () => {
  const result = checkPushRefs(porcelain(`+\t${ownRef}:${ownRef}\t123abcd...456abcd (forced update)`), ticket);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ ref, kind }) => ({ ref, kind })), [{ ref: ownRef, kind: "force" }]);
});

test("malformed rows, up-to-date refs, and rejected refs block the check", () => {
  for (const line of [
    "garbled output",
    `*\t${ownRef}`,
    `*\t${ownRef}:${ownRef}`,
    `?\t${ownRef}:${ownRef}\t[unknown]`,
    `=\t${ownRef}:${ownRef}\t[up to date]`,
    `!\t${ownRef}:${ownRef}\t[rejected] (non-fast-forward)`,
  ]) {
    const result = checkPushRefs(porcelain(line), ticket);
    assert.equal(result.ok, false, line);
    assert.deepEqual(result.problems.map(({ kind }) => kind), ["unreadable"], line);
  }
});

test("empty output or output with only framing gives one unreadable problem", () => {
  for (const text of ["", porcelain()]) {
    const result = checkPushRefs(text, ticket);
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map(({ kind }) => kind), ["unreadable"]);
  }
});

test("all blocked refs are reported in input order alongside an allowed update", () => {
  const text = porcelain(
    ` \t${ownRef}:refs/heads/main\t123abcd..456abcd`,
    `*\t${ownRef}:${ownRef}\t[new branch]`,
    "*\trefs/tags/v1.0.0:refs/tags/v1.0.0\t[new tag]",
  );
  const result = checkPushRefs(text, ticket);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ ref, kind }) => ({ ref, kind })), [
    { ref: "refs/heads/main", kind: "protected-branch" },
    { ref: "refs/tags/v1.0.0", kind: "tag" },
  ]);
});

test("problem reasons omit the remote header and URL", () => {
  const url = remote.slice("To ".length);
  const result = checkPushRefs(porcelain(`garbled output from ${url}`, `+\t${ownRef}:${ownRef}\t${url}`), ticket);
  assert.equal(result.problems.length, 2);
  for (const { reason } of result.problems) {
    assert.ok(reason.length > 0);
    assert.ok(!reason.includes(remote));
    assert.ok(!reason.includes(url));
  }
});
