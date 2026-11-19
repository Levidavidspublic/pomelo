import assert from "node:assert/strict";
import { test } from "node:test";
import { checkUpstreamTests } from "../src/pomelo/upstream-tests.js";

test("an empty change list leaves Friday's tests untouched", () => {
  assert.deepEqual(checkUpstreamTests([]), { ok: true, problems: [] });
});

test("a Pomelo source file and a Pomelo test are allowed", () => {
  assert.deepEqual(checkUpstreamTests([
    { path: "src/pomelo/x.ts", status: "modified" },
    { path: "test/pomelo-x.test.ts", status: "added" },
  ]), { ok: true, problems: [] });
});

test("modifying a Friday test reports its path, status, and reason", () => {
  const result = checkUpstreamTests([{ path: "test/theme.test.ts", status: "modified" }]);

  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].path, "test/theme.test.ts");
  assert.equal(result.problems[0].status, "modified");
  assert.match(result.problems[0].why, /Friday/);
});

test("deleting a Friday test fixture reports the deletion", () => {
  const result = checkUpstreamTests([{ path: "test/fixtures/qwen/success.json", status: "deleted" }]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path, status }) => ({ path, status })), [
    { path: "test/fixtures/qwen/success.json", status: "deleted" },
  ]);
});

test("renaming a Friday test to a Pomelo name reports its old path", () => {
  const result = checkUpstreamTests([
    { path: "test/pomelo-unread.test.ts", status: "renamed", from: "test\\unread.test.ts" },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path, status }) => ({ path, status })), [
    { path: "test/unread.test.ts", status: "renamed" },
  ]);
});

test("adding a test without the Pomelo prefix reports the naming rule", () => {
  const result = checkUpstreamTests([{ path: "test/new.test.ts", status: "added" }]);

  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].path, "test/new.test.ts");
  assert.equal(result.problems[0].status, "added");
  assert.match(result.problems[0].why, /test\/pomelo-/);
});

test("a change to Friday's test runner is reported", () => {
  const result = checkUpstreamTests([{ path: "scripts/test.mjs", status: "modified" }]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path, status }) => ({ path, status })), [
    { path: "scripts/test.mjs", status: "modified" },
  ]);
});

test("a Windows-style path reports the same problem as a forward-slash path", () => {
  const result = checkUpstreamTests([{ path: "test\\voice.test.ts", status: "modified" }]);

  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].path, "test/voice.test.ts");
  assert.deepEqual(result, checkUpstreamTests([{ path: "test/voice.test.ts", status: "modified" }]));
});

test("problems for tests, helpers, and the runner are sorted by path", () => {
  const result = checkUpstreamTests([
    { path: "test/theme.test.ts", status: "modified" },
    { path: "test/fake-dom.ts", status: "modified" },
    { path: "scripts/test.mjs", status: "deleted" },
    { path: "test/css.mjs", status: "modified" },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path }) => path), [
    "scripts/test.mjs",
    "test/css.mjs",
    "test/fake-dom.ts",
    "test/theme.test.ts",
  ]);
});
