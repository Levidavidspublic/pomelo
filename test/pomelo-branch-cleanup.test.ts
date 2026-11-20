import assert from "node:assert/strict";
import { test } from "node:test";
import { branchCleanup } from "../src/pomelo/branch-cleanup.js";

test("done ticket branches are offered in numeric ticket order", () => {
  const branches = `  origin/ticket/611-p2-12
  origin/ticket/61-p2-11
  origin/ticket/6-p0-1`;
  const tickets = [
    { number: 61, state: "done" },
    { number: 611, state: "done" },
    { number: 6, state: "done" },
  ];

  assert.deepEqual(branchCleanup(branches, tickets), {
    delete: [
      { branch: "origin/ticket/6-p0-1", ticket: 6, reason: "Ticket #6 is done." },
      { branch: "origin/ticket/61-p2-11", ticket: 61, reason: "Ticket #61 is done." },
      { branch: "origin/ticket/611-p2-12", ticket: 611, reason: "Ticket #611 is done." },
    ],
    keep: [],
  });
});

test("every ticket state other than done keeps the branch", () => {
  for (const state of ["pr_open", "running", "stuck", "held", "new", "merged"]) {
    const branch = "origin/ticket/61-p2-11";
    assert.deepEqual(branchCleanup(branch, [{ number: 61, state }]), {
      delete: [],
      keep: [{ branch, reason: `Ticket #61 is ${state}.` }],
    });
  }
});

test("main, symbolic refs, import, docs, and upstream branches are kept", () => {
  const branches = `  origin/main
  origin/HEAD -> origin/main
  origin/import/friday-v0.3.4
  origin/docs/harness-six-docs-2026-11-19
  upstream/main
  upstream/ticket/61-p2-11
  origin/ticket/61-p2-11 -> origin/main`;

  assert.deepEqual(branchCleanup(branches, [{ number: 61, state: "done" }]), {
    delete: [],
    keep: [
      { branch: "origin/main", reason: "The fork's main branch is protected." },
      { branch: "origin/HEAD", reason: "This is a symbolic ref." },
      { branch: "origin/import/friday-v0.3.4", reason: "Import branches are protected." },
      { branch: "origin/docs/harness-six-docs-2026-11-19", reason: "Docs branches are protected." },
      { branch: "upstream/main", reason: "Upstream branches are protected." },
      { branch: "upstream/ticket/61-p2-11", reason: "Upstream branches are protected." },
      { branch: "origin/ticket/61-p2-11", reason: "This is a symbolic ref." },
    ],
  });
});

test("an absent ticket stays kept even if a shorter or longer ticket number is done", () => {
  const branch = "origin/ticket/61-p2-11";
  const tickets = [{ number: 6, state: "done" }, { number: 611, state: "done" }];

  assert.deepEqual(branchCleanup(branch, tickets), {
    delete: [],
    keep: [{ branch, reason: "Ticket #61 is missing from the list." }],
  });
});

test("only complete fork ticket branch names qualify", () => {
  const branches = ["origin/feature/61-p2-11", "backup/ticket/61-p2-11", "origin/ticket/61-p2-11-extra"];
  assert.deepEqual(branchCleanup(branches.join("\n"), [{ number: 61, state: "done" }]), {
    delete: [],
    keep: branches.map((branch) => ({ branch, reason: "This is outside the fork's ticket branch format." })),
  });
});

test("conflicting ticket records keep the branch in either order", () => {
  const branch = "origin/ticket/61-p2-11";
  const done = { number: 61, state: "done" };
  const running = { number: 61, state: "running" };

  for (const tickets of [[done, running], [running, done]]) {
    assert.deepEqual(branchCleanup(branch, tickets), {
      delete: [],
      keep: [{ branch, reason: "Ticket #61 is running." }],
    });
  }
});

test("branch text can have blank lines, leading spaces, and Windows line endings", () => {
  const branches = "\r\n  origin/main\r\n  \r\n\t origin/ticket/61-p2-11\r\n";
  assert.deepEqual(branchCleanup(branches, [{ number: 61, state: "done" }]), {
    delete: [{ branch: "origin/ticket/61-p2-11", ticket: 61, reason: "Ticket #61 is done." }],
    keep: [{ branch: "origin/main", reason: "The fork's main branch is protected." }],
  });
});

test("empty or non-string branch input returns empty lists", () => {
  const tickets = [{ number: 61, state: "done" }];
  for (const input of ["", " \r\n\t", undefined, null, 61, ["origin/ticket/61-p2-11"]]) {
    assert.deepEqual(branchCleanup(input, tickets), { delete: [], keep: [] });
  }
});
