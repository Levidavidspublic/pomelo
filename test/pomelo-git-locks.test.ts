import assert from "node:assert/strict";
import test from "node:test";
import { gitLocks } from "../src/pomelo/git-locks.js";

const idle = { nowSeconds: 1_000, gitRunning: false };
const oldIndex = "399.5 .git/index.lock";

test("an empty listing gives go even if Git is running", () => {
  const result = gitLocks("", { ...idle, gitRunning: true });
  assert.equal(result.verdict, "go");
  assert.deepEqual(result.locks, []);
});

test("an old index lock can be cleaned when Git is idle", () => {
  const result = gitLocks(oldIndex, idle);
  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.locks, [
    { path: ".git/index.lock", ageSeconds: 600.5, kind: "index", stale: true },
  ]);
});

test("a running Git command keeps every lock from being marked stale", () => {
  const result = gitLocks(`${oldIndex}\n200 .git/HEAD.lock`, { ...idle, gitRunning: true });
  assert.equal(result.verdict, "wait");
  assert.deepEqual(result.locks, [
    { path: ".git/index.lock", ageSeconds: 600.5, kind: "index", stale: false },
    { path: ".git/HEAD.lock", ageSeconds: 800, kind: "head", stale: false },
  ]);
});

test("fresh locks and locks at the default limit still require a wait", () => {
  for (const timestamp of [999, 400]) {
    const result = gitLocks(`${timestamp} .git/index.lock`, idle);
    assert.equal(result.verdict, "wait");
    assert.equal(result.locks[0].stale, false);
  }
});

test("a mixed listing identifies each stale lock and keeps the fresh lock unmarked", () => {
  const result = gitLocks(`${oldIndex}\n998 .git/HEAD.lock\n200 .git/config.lock`, idle);
  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.locks.filter((lock) => lock.stale).map((lock) => lock.path), [
    ".git/index.lock",
    ".git/config.lock",
  ]);
});

test("lock paths determine their kind and keep spaces in the path", () => {
  const entries = [
    [".git/refs/heads/ticket/1-x.lock", "ref"],
    [".git/HEAD.lock", "head"],
    [".git/config.lock", "config"],
    [".git/packed-refs.lock", "packed-refs"],
    [".git/shallow.lock", "shallow"],
    [".git/worktrees/w1/index.lock", "worktree"],
    [".git/worktrees/worker one/refs/heads/topic.lock", "worktree"],
    [".git/maintenance.lock", "other"],
  ];
  const result = gitLocks(entries.map(([path]) => `100 ${path}`).join("\n"), idle);
  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.locks, entries.map(([path, kind]) => ({ path, kind, ageSeconds: 900, stale: true })));
});

test("paths outside .git, containing .., or missing the .lock suffix are never stale", () => {
  const paths = ["../outside/index.lock", "/etc/x.lock", ".git/refs/../../index.lock", ".git/hooks/pre-commit"];
  const result = gitLocks(paths.map((path) => `100 ${path}`).join("\n"), idle);
  assert.equal(result.verdict, "wait");
  assert.deepEqual(result.locks, paths.map((path) => ({ path, kind: "other", ageSeconds: 900, stale: false })));
});

test("an unreadable line stops the check and yields no cleanup candidates", () => {
  for (const line of [".git/HEAD.lock", "NaN .git/HEAD.lock", "1000", "1060.1 .git/HEAD.lock"]) {
    assert.deepEqual(gitLocks(`${oldIndex}\n${line}`, idle), { verdict: "stop", locks: [], reason: "unreadable" });
  }
});

test("an invalid current time stops the check even with no locks", () => {
  for (const nowSeconds of [-1, NaN, Infinity, "1000" as unknown as number]) {
    assert.deepEqual(gitLocks("", { ...idle, nowSeconds }), { verdict: "stop", locks: [], reason: "unreadable" });
  }
});

test("a lock timestamp up to a minute ahead is treated as fresh", () => {
  const result = gitLocks("1060 .git/index.lock", idle);
  assert.equal(result.verdict, "wait");
  assert.deepEqual(result.locks, [
    { path: ".git/index.lock", ageSeconds: 0, kind: "index", stale: false },
  ]);
});

test("Windows line endings and a trailing newline preserve the listing", () => {
  const secondLock = "900 .git/HEAD.lock";
  assert.deepEqual(gitLocks(`${oldIndex}\r\n${secondLock}\r\n`, idle), gitLocks(`${oldIndex}\n${secondLock}`, idle));
});

test("a custom stale limit controls when a lock can be cleaned", () => {
  const listing = "950 .git/index.lock";
  assert.equal(gitLocks(listing, { ...idle, staleAfterSeconds: 50 }).verdict, "wait");
  assert.equal(gitLocks(listing, { ...idle, staleAfterSeconds: 49 }).verdict, "clean");
});
