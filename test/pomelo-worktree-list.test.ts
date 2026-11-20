import assert from "node:assert/strict";
import test from "node:test";
import { leftoverWorktrees } from "../src/pomelo/worktree-list.js";

const main = `worktree /repos/pomelo
HEAD abcd1234abcd1234abcd1234abcd1234abcd1234
branch refs/heads/main`;

const worker = `worktree /repos/worker 665
HEAD abcd1234abcd1234abcd1234abcd1234abcd1234
branch refs/heads/ticket/665-p0-107`;

const prunableWorker = `${worker}\nprunable gitdir file points to non-existent location`;

test("a list containing only the main worktree is clean", () => {
  assert.deepEqual(leftoverWorktrees(main, { liveBranches: [] }), {
    verdict: "clean",
    remove: [],
    keep: [{ path: "/repos/pomelo", reason: "This is the main worktree." }],
    summary: "Clean with 1 worktree kept.",
  });
});

test("a live claim keeps a ticket worktree even when Git marks it prunable", () => {
  for (const liveBranches of [["ticket/665-p0-107"], new Set(["refs/heads/ticket/665-p0-107"])]) {
    const result = leftoverWorktrees(`${main}\n\n${prunableWorker}`, { liveBranches });
    assert.equal(result.verdict, "clean");
    assert.deepEqual(result.remove, []);
    assert.deepEqual(result.keep[1], { path: "/repos/worker 665", reason: "The ticket has a live claim." });
  }
});

test("an unclaimed ticket worktree is a cleanup candidate and its entire path is preserved", () => {
  assert.deepEqual(leftoverWorktrees(`${main}\n\n${worker}`, { liveBranches: ["ticket/665-p0-108"] }), {
    verdict: "cleanup",
    remove: [{ path: "/repos/worker 665", branch: "ticket/665-p0-107", reason: "The ticket has no live claim." }],
    keep: [{ path: "/repos/pomelo", reason: "This is the main worktree." }],
    summary: "1 leftover worktree to remove, 1 kept.",
  });
});

test("a prunable ticket worktree is a cleanup candidate with or without a Git reason", () => {
  for (const entry of [prunableWorker, `${worker}\nprunable`]) {
    const result = leftoverWorktrees(`${main}\n\n${entry}`, { liveBranches: [] });
    assert.equal(result.verdict, "cleanup");
    assert.deepEqual(result.remove, [
      { path: "/repos/worker 665", branch: "ticket/665-p0-107", reason: "Git marks this worktree as prunable." },
    ]);
  }
});

test("a prunable entry without a recorded branch reports a null branch", () => {
  const missing = `worktree /repos/missing
HEAD 0000000000000000000000000000000000000000
prunable`;
  const result = leftoverWorktrees(`${main}\n\n${missing}`, { liveBranches: [] });
  assert.equal(result.verdict, "cleanup");
  assert.deepEqual(result.remove, [
    { path: "/repos/missing", branch: null, reason: "Git marks this worktree as prunable." },
  ]);
});

test("locked worktrees with or without a lock reason are kept even when marked prunable", () => {
  for (const lock of ["locked", "locked worker is paused"]) {
    const result = leftoverWorktrees(`${main}\n\n${worker}\n${lock}\nprunable`, { liveBranches: [] });
    assert.equal(result.verdict, "clean");
    assert.deepEqual(result.remove, []);
    assert.deepEqual(result.keep[1], { path: "/repos/worker 665", reason: "This worktree is locked." });
  }
});

test("bare, detached and non-ticket worktrees are kept even when marked prunable", () => {
  const bare = `worktree /repos/bare
bare
prunable`;
  const detached = `worktree /repos/detached
HEAD abcd1234abcd1234abcd1234abcd1234abcd1234
detached
prunable`;
  const branches = ["main", "import/friday-v0.3.4", "other/ticket/665-p0-107", "ticket/665-p0-107/topic", "Ticket/665-p0-107"];
  const entries = branches.map((branch) => prunableWorker
    .replace("/repos/worker 665", `/repos/${branch}`)
    .replace("branch refs/heads/ticket/665-p0-107", `branch refs/heads/${branch}`));
  const result = leftoverWorktrees([main, bare, detached, ...entries].join("\n\n"), { liveBranches: [] });

  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.remove, []);
  assert.deepEqual(result.keep.slice(1), [
    { path: "/repos/bare", reason: "This is a bare repository." },
    { path: "/repos/detached", reason: "This worktree has a detached HEAD." },
    ...branches.map((branch) => ({ path: `/repos/${branch}`, reason: "This branch is outside the ticket branch pattern." })),
  ]);
});

test("the first worktree is kept even on an unclaimed prunable ticket branch", () => {
  const result = leftoverWorktrees(prunableWorker, { liveBranches: [] });
  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.remove, []);
  assert.deepEqual(result.keep, [{ path: "/repos/worker 665", reason: "This is the main worktree." }]);
});

test("Windows line endings and trailing blank lines give the same result", () => {
  const windows = `${main}\n\n${worker}`.replaceAll("/repos/", "C:/repos/");
  assert.deepEqual(
    leftoverWorktrees(`${windows.replaceAll("\n", "\r\n")}\r\n\r\n`, { liveBranches: [], now: 42 }),
    leftoverWorktrees(windows, { liveBranches: [] }),
  );
});

test("empty or malformed lists are unreadable and yield no cleanup candidates", () => {
  for (const input of [
    "", "\r\n\r\n", "fatal: this directory has no Git repository", "worktree \nHEAD abcd",
    `${main}\n\n${worker}\n\nworktree /repos/truncated`, `${main}\n${worker}`,
    `${main}\n\n${worker.replace("/repos/worker 665", "/repos/pomelo")}`,
  ]) {
    const result = leftoverWorktrees(input, { liveBranches: [] });
    assert.equal(result.verdict, "unreadable");
    assert.deepEqual(result.remove, []);
    assert.deepEqual(result.keep, []);
    assert.match(result.summary, /unreadable/i);
  }
});
