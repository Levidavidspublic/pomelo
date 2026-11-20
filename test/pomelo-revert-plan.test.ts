import assert from "node:assert/strict";
import { test } from "node:test";
import { planRevert, type RevertPlanCommit } from "../src/pomelo/revert-plan.js";

const green = { sha: "aaa1111", ticketNumber: 10, subject: "Add tests (#10)", check: "pass" } as const;
const red = { sha: "bbb2222", ticketNumber: 11, subject: "Add a card (#11)", check: "fail" } as const;
const laterRed = { sha: "ccc3333", ticketNumber: 12, subject: "Add a panel (#12)", check: "fail" } as const;
const pending = { ...laterRed, check: "pending" } as const;

test("the newest finished check passing means nothing to do", () => {
  const latestPass = { ...laterRed, check: "pass" } as const;
  for (const commits of [[green, latestPass], [green, red, latestPass], [red, green, pending]]) {
    assert.deepEqual(planRevert(commits), { verdict: "nothing_to_do", reason: "checks_passed" });
  }
});

test("one failed squash commit gets one revert PR with no later merges to rerun", () => {
  const earlierPass = { ...green, sha: "ddd4444", ticketNumber: 9 };
  assert.deepEqual(planRevert([earlierPass, green, red]), {
    verdict: "revert",
    reason: "ticket_failed",
    method: "revert_pr",
    sha: red.sha,
    ticketNumber: red.ticketNumber,
    rerun: [],
  });
});

test("green followed by two failures reverts the first and reruns the second", () => {
  assert.deepEqual(planRevert([green, red, laterRed]), {
    verdict: "revert",
    reason: "ticket_failed",
    method: "revert_pr",
    sha: red.sha,
    ticketNumber: red.ticketNumber,
    rerun: [{ sha: laterRed.sha, ticketNumber: laterRed.ticketNumber }],
  });
});

test("later ticket merges are listed in main order, including unfinished checks", () => {
  const ordinaryCommit = { sha: "ddd4444", subject: "Update notices", check: "unknown" } as const;
  const laterPending = { ...pending, sha: "eee5555", ticketNumber: 8 };
  const commits = Object.freeze([green, red, laterRed, ordinaryCommit, laterPending]
    .map((commit) => Object.freeze(commit)));
  const plan = planRevert(commits);
  assert.equal(plan.verdict, "revert");
  assert.deepEqual(plan.rerun, [
    { sha: laterRed.sha, ticketNumber: laterRed.ticketNumber },
    { sha: laterPending.sha, ticketNumber: laterPending.ticketNumber },
  ]);
  assert.deepEqual(planRevert(commits), plan);
});

test("wait while the first possible failure still has pending checks", () => {
  for (const commits of [[pending], [green, pending, red]]) {
    assert.deepEqual(planRevert(commits), { verdict: "wait", reason: "checks_pending" });
  }
});

test("a missing check result before a known failure also waits", () => {
  assert.deepEqual(planRevert([green, { ...pending, check: "unknown" }, red]), {
    verdict: "wait",
    reason: "checks_unknown",
  });
});

test("a failed commit without a ticket needs Amit", () => {
  const { sha, subject, check } = red;
  for (const commit of [{ sha, subject, check }, { sha, subject, check, ticketNumber: null }]) {
    assert.deepEqual(planRevert([green, commit]), { verdict: "ask_amit", reason: "not_ticket_merge" });
  }
});

test("a failed revert needs Amit even if it has a ticket number", () => {
  assert.deepEqual(planRevert([green, { ...red, subject: 'Revert "Add a card (#11)"' }]), {
    verdict: "ask_amit",
    reason: "failed_revert",
  });
});

test("consecutive failures without an observed passing baseline need Amit", () => {
  assert.deepEqual(planRevert([red, laterRed]), { verdict: "ask_amit", reason: "multiple_failures" });
});

test("malformed histories report bad_input even when the tip passes", () => {
  const invalid = [
    [],
    null,
    green,
    [red, { ...green, sha: red.sha }],
    [{ ...red, sha: 123 }, green],
    [{ ...red, sha: " " }, green],
    [{ ...red, subject: null }, green],
    [{ ...red, ticketNumber: 0 }, green],
    [{ ...red, check: "failed" }, green],
    [null, green],
  ];
  for (const commits of invalid) {
    assert.deepEqual(planRevert(commits), { verdict: "ask_amit", reason: "bad_input" });
  }
});

test("the verdicts never contain destructive history operations", () => {
  const histories: readonly (readonly RevertPlanCommit[])[] = [[green], [pending], [green, red, laterRed], []];
  for (const commits of histories) {
    assert.doesNotMatch(JSON.stringify(planRevert(commits)), /force|reset|delete/i);
  }
});
