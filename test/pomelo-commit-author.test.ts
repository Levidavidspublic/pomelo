import assert from "node:assert/strict";
import { test } from "node:test";
import { commitAuthorCheck } from "../src/pomelo/commit-author.js";

const hash = "abc1234" + "0".repeat(33);
const otherHash = "def5678" + "0".repeat(33);
const worker = "fixture-worker@users.noreply.github.com";
const noreply = "*@users.noreply.github.com";
const approved = "fixture-approved@example.com";
const author = "fixture-author@example.com";
const committer = "fixture-committer@users.noreply.github.com";

function row(authorEmail: string, committerEmail: string, commit = hash): string {
  return [commit, "Example Author", authorEmail, "Example Committer", committerEmail].join("\t");
}

test("allows a noreply domain pattern and an exact address", () => {
  assert.deepEqual(commitAuthorCheck(row(worker, approved), [noreply, approved]), {
    ok: true,
    checked: 1,
    findings: [],
    problems: [],
  });
});

test("names the author when an exact pattern allows only the committer at the same domain", () => {
  const result = commitAuthorCheck(row(author, approved), [approved]);
  assert.equal(result.ok, false);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.findings.map(({ commit, side, domain }) => ({ commit, side, domain })), [
    { commit: "abc1234", side: "author", domain: "example.com" },
  ]);
});

test("names the committer when the author is allowed", () => {
  const result = commitAuthorCheck(row(worker, author), [noreply]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ commit, side, domain }) => ({ commit, side, domain })), [
    { commit: "abc1234", side: "committer", domain: "example.com" },
  ]);
});

test("reports both sides once and omits all email local parts from the result", () => {
  const result = commitAuthorCheck(row(author, committer), [approved]);
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  const [finding] = result.findings;
  assert.equal(finding.commit, "abc1234");
  assert.equal(finding.side, "both");
  assert.equal(finding.domain, "example.com, users.noreply.github.com");
  assert.match(finding.reason, /author.*committer/i);
  const output = JSON.stringify(result);
  for (const email of [author, committer, approved]) {
    assert.ok(!output.includes(email.split("@")[0]));
  }
});

test("matches exact addresses and wildcard domains case-insensitively", () => {
  const result = commitAuthorCheck(row(worker.toUpperCase(), approved), [noreply, approved.toUpperCase()]);
  assert.equal(result.ok, true);
});

test("a wildcard pattern requires the complete email domain to match", () => {
  const lookAlike = "fixture-worker@users.noreply.github.com.example.com";
  const result = commitAuthorCheck(row(lookAlike, worker), [noreply]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ side, domain }) => ({ side, domain })), [
    { side: "author", domain: "users.noreply.github.com.example.com" },
  ]);
});

test("checks every row in order with CRLF and reports a shared domain once", () => {
  const log = [
    row(author, approved),
    row(approved, approved, "e".repeat(40)),
    row(author, author, otherHash),
    "",
  ].join("\r\n");
  const result = commitAuthorCheck(log, [approved]);
  assert.equal(result.checked, 3);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.findings.map(({ commit, side, domain }) => ({ commit, side, domain })), [
    { commit: "abc1234", side: "author", domain: "example.com" },
    { commit: "def5678", side: "both", domain: "example.com" },
  ]);
});

test("reports malformed lines without repeating their contents and checks later rows", () => {
  const log = [`${hash}\tExample Author\t${author}`, row(worker, worker, author), row(worker, worker)].join("\n");
  const result = commitAuthorCheck(log, [noreply]);
  assert.equal(result.ok, false);
  assert.equal(result.checked, 1);
  assert.equal(result.problems.length, 2);
  assert.match(result.problems[0], /line 1/i);
  assert.match(result.problems[1], /line 2/i);
  assert.ok(!JSON.stringify(result).includes(author.split("@")[0]));
});

test("reports empty emails on either side, including the final field of a row", () => {
  const log = `${row("", worker)}\n${row(worker, "", otherHash)}\n`;
  const result = commitAuthorCheck(log, [noreply]);
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 2);
  assert.match(result.problems[0], /abc1234.*author.*empty/i);
  assert.match(result.problems[1], /def5678.*committer.*empty/i);
});

test("reports an invalid email safely and still checks the other side", () => {
  const result = commitAuthorCheck(row(`fixture-unreadable@${author}`, author), [noreply]);
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /author.*invalid/i);
  assert.equal(result.findings[0].side, "committer");
  assert.ok(!JSON.stringify(result).includes("fixture-unreadable"));
  assert.ok(!JSON.stringify(result).includes(author.split("@")[0]));
});

test("reports an empty allowed list as a problem", () => {
  const result = commitAuthorCheck(row(worker, worker), []);
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /allowed.*empty/i);
});

test("reports nothing to check for zero commits", () => {
  assert.deepEqual(commitAuthorCheck("", [noreply]), {
    ok: false,
    checked: 0,
    findings: [],
    problems: ["nothing to check"],
  });
});
