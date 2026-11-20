import assert from "node:assert/strict";
import test from "node:test";
import { checkPrSource, type PrSourceRules } from "../src/pomelo/pr-source.js";

const rules: PrSourceRules = { allowedAuthors: ["fixture-kitchen-worker"] };
const ticket = {
  head: { repo: { full_name: "fixture-team/fixture-repo" }, ref: "ticket/123-p0-93" },
  base: { repo: { full_name: "fixture-team/fixture-repo" } },
  user: { login: "fixture-kitchen-worker" },
};

test("an allowed author can use a ticket branch in the base repository", () => {
  assert.deepEqual(checkPrSource(JSON.stringify(ticket), rules), { decision: "go", reasons: [] });
});

test("a PR from a different repository names both repositories", () => {
  const pr = { ...ticket, head: { ...ticket.head, repo: { full_name: "fixture-copy/fixture-repo" } } };
  const result = checkPrSource(JSON.stringify(pr), rules);
  assert.equal(result.decision, "amit");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /fixture-copy\/fixture-repo/);
  assert.match(result.reasons[0], /fixture-team\/fixture-repo/);
});

test("a deleted head repository needs approval", () => {
  const pr = { ...ticket, head: { ...ticket.head, repo: null } };
  const result = checkPrSource(JSON.stringify(pr), rules);
  assert.equal(result.decision, "amit");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /head repository/i);
});

test("an unknown author needs approval and the reason names their login", () => {
  const pr = { ...ticket, user: { login: "fixture-unknown-author" } };
  const result = checkPrSource(JSON.stringify(pr), rules);
  assert.equal(result.decision, "amit");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /fixture-unknown-author/);
});

test("branches outside the default prefix need approval", () => {
  for (const ref of ["main", "feature/x", "Ticket/123-p0-93"]) {
    const pr = { ...ticket, head: { ...ticket.head, ref } };
    const result = checkPrSource(JSON.stringify(pr), rules);
    assert.equal(result.decision, "amit");
    assert.equal(result.reasons.length, 1);
    assert.ok(result.reasons[0].includes(ref));
  }
});

test("a custom branch prefix replaces the default", () => {
  const customRules = { ...rules, branchPrefix: "work/" };
  const pr = { ...ticket, head: { ...ticket.head, ref: "work/123" } };
  assert.deepEqual(checkPrSource(JSON.stringify(pr), customRules), { decision: "go", reasons: [] });
  assert.equal(checkPrSource(JSON.stringify(ticket), customRules).decision, "amit");
});

test("repository names and author logins are compared without regard to case", () => {
  const pr = {
    ...ticket,
    head: { ...ticket.head, repo: { full_name: "FIXTURE-TEAM/Fixture-Repo" } },
    user: { login: "Fixture-Kitchen-Worker" },
  };
  assert.deepEqual(checkPrSource(JSON.stringify(pr), rules), { decision: "go", reasons: [] });
});

test("broken JSON, empty text and non-object JSON each give one reason", () => {
  for (const text of ['{"head":', "", "[]", "null", '"ticket"']) {
    const result = checkPrSource(text, rules);
    assert.equal(result.decision, "amit");
    assert.equal(result.reasons.length, 1);
  }
});

test("missing, blank and wrong-type PR fields need approval", () => {
  const cases = [
    [{ ...ticket, head: { ref: ticket.head.ref } }, /head repository/i],
    [{ ...ticket, head: { ...ticket.head, repo: { full_name: 123 } } }, /head repository/i],
    [{ ...ticket, base: { repo: {} } }, /base repository/i],
    [{ ...ticket, base: { repo: { full_name: " " } } }, /base repository/i],
    [{ ...ticket, head: { repo: ticket.head.repo } }, /head branch/i],
    [{ ...ticket, head: { ...ticket.head, ref: [] } }, /head branch/i],
    [{ ...ticket, user: null }, /login/i],
    [{ ...ticket, user: { login: "" } }, /login/i],
  ] as const;

  for (const [pr, reason] of cases) {
    const result = checkPrSource(JSON.stringify(pr), rules);
    assert.equal(result.decision, "amit");
    assert.equal(result.reasons.length, 1);
    assert.match(result.reasons[0], reason);
  }
});

test("two source problems give two reasons in a steady order without including the title or body", () => {
  const pr = {
    ...ticket,
    title: "CANARY-PR-SOURCE",
    body: "CANARY-PR-SOURCE",
    user: { login: "fixture-unknown-author" },
    head: { ...ticket.head, repo: { full_name: "fixture-copy/fixture-repo" } },
  };
  const result = checkPrSource(JSON.stringify(pr), rules);
  assert.equal(result.decision, "amit");
  assert.equal(result.reasons.length, 2);
  assert.match(result.reasons[0], /fixture-copy\/fixture-repo/);
  assert.match(result.reasons[1], /fixture-unknown-author/);
  assert.ok(result.reasons.every((reason) => !reason.includes("CANARY-PR-SOURCE")));
});
