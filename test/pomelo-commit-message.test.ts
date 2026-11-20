import assert from "node:assert/strict";
import { test } from "node:test";
import { commitMessageProblems } from "../src/pomelo/commit-message.js";

const ticket = { number: 791, key: "P0-128" };
const hash = "abc1234" + "0".repeat(33);
const otherHash = "def5678" + "0".repeat(33);
const parent = "a".repeat(40);

function record(subject: string, commit = hash, parents = parent): string {
  return `${[commit, parents, subject].join("\x1f")}\x1e`;
}

test("allows a clean commit and a subject naming this ticket", () => {
  for (const subject of ["Add the commit-message check", "[P0-128] Check commit messages (#791)"]) {
    assert.deepEqual(commitMessageProblems(`${record(subject)}\n`, ticket), {
      ok: true,
      commits: 1,
      problems: [],
    });
  }
});

test("allows a Hebrew subject and keeps it whole when reporting it", () => {
  const subject = "בדיקה של הודעת השמירה";
  assert.equal(commitMessageProblems(record(subject, hash, ""), ticket).ok, true);
  const result = commitMessageProblems(record(subject, hash, `${parent} ${otherHash}`), ticket);
  assert.equal(result.problems[0].subject, subject);
  assert.ok(result.problems[0].reason.includes(subject));
});

const badSubjects = [
  ["empty-subject", ""],
  ["empty-subject", " \t "],
  ["fixup", "fixup! Tidy the check"],
  ["fixup", "squash! Tidy the check"],
  ["fixup", "amend! Tidy the check"],
  ["wip", "WIP"],
  ["wip", "wip: Add checks"],
  ["wip", "tmp checks"],
  ["wip", "temp-check"],
  ["other-ticket", "[P0-129] Update the check"],
  ["other-ticket", "Update #791 and #792"],
  ["too-long", "א".repeat(201)],
  ["revert-of-other", 'Revert "[P0-129] Update the check"'],
  ["revert-of-other", 'Revert "Update the check (#792)"'],
] as const;

for (const [kind, subject] of badSubjects) {
  test(`reports ${kind} for ${JSON.stringify(subject.slice(0, 24))}`, () => {
    const result = commitMessageProblems(record(subject), ticket);
    assert.equal(result.ok, false);
    assert.equal(result.commits, 1);
    assert.equal(result.problems.length, 1);
    const [problem] = result.problems;
    assert.equal(problem.kind, kind);
    assert.equal(problem.hash, hash);
    assert.equal(problem.subject, subject);
    assert.match(problem.reason, /\babc1234\b/);
  });
}

test("reports merge commits and checks later records in order", () => {
  const log = [
    record("Merge branches", hash, `${parent} ${otherHash}`),
    record("WIP: Add a test", otherHash),
    "",
  ].join("\r\n");
  const result = commitMessageProblems(log, ticket);
  assert.equal(result.ok, false);
  assert.equal(result.commits, 2);
  assert.deepEqual(result.problems.map(({ hash, kind }) => ({ hash, kind })), [
    { hash, kind: "merge-commit" },
    { hash: otherHash, kind: "wip" },
  ]);
});

test("reports independent problems on the same commit", () => {
  const result = commitMessageProblems(record("fixup! Update #792", hash, `${parent} ${otherHash}`), ticket);
  assert.equal(result.commits, 1);
  assert.deepEqual(result.problems.map(({ kind }) => kind), ["fixup", "merge-commit", "other-ticket"]);
});

test("allows longer words, 200 characters, this ticket's revert, and skip-CI markers", () => {
  const log = [
    record("Temporary check [skip ci]", hash),
    record("א".repeat(200), otherHash),
    record('Revert "[P0-128] Add the check (#791)"', parent),
  ].join("\n");
  assert.deepEqual(commitMessageProblems(log, ticket), { ok: true, commits: 3, problems: [] });
});

test("cuts the subject at 80 characters in the reason and keeps the full subject", () => {
  const preview = "א".repeat(79) + "📝";
  const subject = preview + "ב".repeat(121);
  const [problem] = commitMessageProblems(record(subject), ticket).problems;
  assert.equal(problem.subject, subject);
  assert.ok(problem.reason.includes(preview));
  assert.ok(!problem.reason.includes(preview + "ב"));
  assert.ok(!problem.reason.includes(hash));
});

test("reports that an empty PR has no commits", () => {
  const result = commitMessageProblems("", ticket);
  assert.equal(result.ok, false);
  assert.equal(result.commits, 0);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0].reason, /PR has no commits/i);
});

test("reports broken log text without throwing and still checks valid records", () => {
  const invalidLog = ["broken record\x1e", record("Check messages", hash, "broken parent")].join("\n");
  const result = commitMessageProblems(invalidLog, ticket);
  assert.equal(result.ok, false);
  assert.equal(result.commits, 0);
  assert.equal(result.problems.length, 2);
  assert.match(result.problems[0].reason, /record 1.*git log/i);
  assert.match(result.problems[1].reason, /record 2.*git log/i);

  const mixed = commitMessageProblems(`${invalidLog}\n${record("WIP: Check messages")}`, ticket);
  assert.equal(mixed.ok, false);
  assert.equal(mixed.commits, 1);
  assert.equal(mixed.problems.at(-1)?.kind, "wip");
});
