import assert from "node:assert/strict";
import test from "node:test";
import { checkTicketStates } from "../src/pomelo/ticket-state.js";

function ticket(number: number, state: string) {
  return { number, key: `P0-${number}`, state };
}

function pr(number: number, ticketNumber: number, state: string) {
  return {
    number,
    headRefName: `ticket/${ticketNumber}-p0-${ticketNumber}`,
    state,
    mergedAt: state === "MERGED" ? "2026-11-20T12:00:00Z" : null,
    baseRefName: "main",
  };
}

function check(tickets: unknown[], prs: unknown[]) {
  return checkTicketStates(JSON.stringify(tickets), JSON.stringify(prs));
}

test("done with a merge, pr_open with an open PR, and new without a PR are clean", () => {
  const result = check(
    [ticket(1, "done"), ticket(2, "pr_open"), ticket(3, "new")],
    [{ ...pr(11, 1, "MERGED"), mergedAt: null }, pr(12, 2, "OPEN")],
  );
  assert.deepEqual(result, { ok: true, verdict: "clean", rows: [] });
});

test("all five mismatch kinds name the ticket and any PR in ticket number order", () => {
  const result = check(
    [ticket(50, "pr_open"), ticket(5, "done"), ticket(30, "pr_open"), ticket(2, "running")],
    [pr(15, 5, "CLOSED"), pr(140, 40, "OPEN"), pr(12, 2, "MERGED"), pr(150, 50, "CLOSED")],
  );
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "mismatch");
  assert.deepEqual(result.rows.map(({ reason, ...row }) => {
    assert.match(reason, /[A-Za-z]/);
    return row;
  }), [
    { ticketNumber: 2, prNumber: 12, kind: "merged-not-done" },
    { ticketNumber: 5, prNumber: 15, kind: "done-not-merged" },
    { ticketNumber: 30, kind: "pr-open-no-pr" },
    { ticketNumber: 40, prNumber: 140, kind: "pr-without-ticket" },
    { ticketNumber: 50, prNumber: 150, kind: "closed-unmerged" },
  ]);
});

test("a new ticket with an open PR is reported, while active and paused tickets are allowed", () => {
  const result = check(
    [ticket(1, "new"), ticket(2, "held"), ticket(3, "stuck"), ticket(4, "running")],
    [pr(11, 1, "OPEN"), pr(12, 2, "OPEN"), pr(13, 3, "OPEN"), pr(14, 4, "OPEN")],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].kind, "pr-without-ticket");
  assert.equal(result.rows[0].ticketNumber, 1);
  assert.equal(result.rows[0].prNumber, 11);
});

test("PRs on non-ticket branches are ignored", () => {
  const prs = ["docs/guide", "loop/update", "import/friday-v0.3.4"].map((headRefName, index) => ({
    ...pr(11 + index, 1, "OPEN"),
    headRefName,
  }));
  assert.deepEqual(check([], prs), { ok: true, verdict: "clean", rows: [] });
});

test("a merged PR takes priority over an open PR in either order", () => {
  const open = pr(12, 1, "OPEN");
  const merged = pr(11, 1, "MERGED");
  for (const prs of [[open, merged], [merged, open]]) {
    assert.equal(check([ticket(1, "done")], prs).verdict, "clean");
    const { rows } = check([ticket(1, "pr_open")], prs);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "merged-not-done");
    assert.equal(rows[0].prNumber, 11);
  }
});

test("an open PR takes priority over an older closed PR", () => {
  const prs = [pr(11, 1, "CLOSED"), pr(12, 1, "OPEN")];
  assert.equal(check([ticket(1, "pr_open")], prs).verdict, "clean");
  const { rows } = check([ticket(1, "done")], prs);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "done-not-merged");
  assert.equal(rows[0].prNumber, 12);
});

test("a done ticket needs merge evidence on main", () => {
  const otherBase = { ...pr(11, 1, "MERGED"), baseRefName: "release" };
  for (const prs of [[], [otherBase]]) {
    const { rows } = check([ticket(1, "done")], prs);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "done-not-merged");
    assert.equal(rows[0].prNumber, undefined);
  }
});

test("a closed PR with a merge timestamp counts as merged and matches by branch number", () => {
  const merged = { ...pr(11, 1, "MERGED"), state: "CLOSED", headRefName: "ticket/1-p0-99" };
  assert.equal(check([ticket(1, "done")], [merged]).verdict, "clean");
});

test("bad JSON, non-arrays, and malformed rows on either side are unreadable", () => {
  const invalidInputs = [
    ["[", "[]"],
    ["[]", "["],
    ["{}", "[]"],
    ["[]", "{}"],
    [[], "[]"],
    ["[]", null],
    [JSON.stringify([{ ...ticket(1, "new"), number: undefined }]), "[]"],
    [JSON.stringify([{ ...ticket(1, "new"), state: undefined }]), "[]"],
    ["[]", JSON.stringify([{ ...pr(11, 1, "OPEN"), number: undefined }])],
    ["[]", JSON.stringify([{ ...pr(11, 1, "OPEN"), state: undefined }])],
    ["[]", JSON.stringify([{ ...pr(11, 1, "OPEN"), headRefName: undefined }])],
  ];
  for (const [tickets, prs] of invalidInputs) {
    const result = checkTicketStates(tickets, prs);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "unreadable");
    assert.deepEqual(result.rows, []);
  }
});

test("empty arrays are clean", () => {
  assert.deepEqual(check([], []), { ok: true, verdict: "clean", rows: [] });
});
