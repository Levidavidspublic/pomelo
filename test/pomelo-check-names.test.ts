import assert from "node:assert/strict";
import test from "node:test";
import { checkRequiredNames } from "../src/pomelo/check-names.js";

test("matches job display names and falls back to the job ID when unnamed", () => {
  const result = checkRequiredNames(["Test suite", "lint", "tests", "old check"], [{
    path: "ci.yml",
    text: `on: pull_request
jobs:
  tests:
    name: Test suite
  lint:
    steps:
      - name: old check
`,
  }]);

  assert.deepEqual(result, {
    ok: false,
    missing: [
      { name: "tests", reason: "No job is named 'tests'" },
      { name: "old check", reason: "No job is named 'old check'" },
    ],
    jobs: [
      { path: "ci.yml", id: "tests", name: "Test suite", onPullRequest: true, matrix: false },
      { path: "ci.yml", id: "lint", name: "lint", onPullRequest: true, matrix: false },
    ],
  });
});

test("accepts matrix suffixes only for jobs with strategy.matrix", () => {
  const result = checkRequiredNames(["test", "test (ubuntu-latest)", "tests", "lint (ubuntu-latest)"], [{
    path: "ci.yml",
    text: `on: [push, pull_request]
jobs:
  platform:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest]
    name: test
  lint:
    strategy:
      fail-fast: false
    env:
      matrix: unrelated
`,
  }]);

  assert.deepEqual(result.missing.map(({ name }) => name), ["tests", "lint (ubuntu-latest)"]);
  assert.deepEqual(result.jobs.map(({ matrix }) => matrix), [true, false]);
});

test("reads pull request triggers from scalars, lists, and block mappings", () => {
  for (const on of [
    "on: pull_request",
    "on: [push, pull_request]",
    "on:\n  - push\n  - pull_request",
    "on:\n- push\n- pull_request",
    "on:\n  push:\n    branches: [main]\n  pull_request:\n    types: [opened]",
  ]) {
    const text = `jobs:\n   smoke:\n      runs-on: ubuntu-latest\n${on}\n`;
    const result = checkRequiredNames(["smoke"], [{ path: "ci.yml", text }]);
    assert.equal(result.ok, true, on);
    assert.equal(result.jobs[0]?.onPullRequest, true, on);
  }
});

test("reports a matching job whose workflow lacks a pull request trigger", () => {
  for (const on of [
    "on: push",
    "on: workflow_dispatch",
    "on: pull_request_target",
    "on:\n  push:\n    branches: [pull_request]",
    "on:\n  workflow_dispatch:\n    inputs:\n      pull_request:",
  ]) {
    const text = `${on}\njobs:\n  smoke:\n    runs-on: ubuntu-latest\n`;
    assert.deepEqual(checkRequiredNames(["smoke"], [{ path: "release.yml", text }]), {
      ok: false,
      missing: [{ name: "smoke", reason: "Job 'smoke' is in release.yml, which does not run on pull requests" }],
      jobs: [{ path: "release.yml", id: "smoke", name: "smoke", onPullRequest: false, matrix: false }],
    }, on);
  }
});

test("accepts a pull request match even if an earlier workflow has the same job name", () => {
  const result = checkRequiredNames(["smoke"], [
    { path: "release.yml", text: "on: push\njobs:\n  smoke:\n" },
    { path: "ci.yml", text: "on: pull_request\njobs:\n  check:\n    name: smoke\n" },
  ]);

  assert.deepEqual(result, {
    ok: true,
    missing: [],
    jobs: [
      { path: "release.yml", id: "smoke", name: "smoke", onPullRequest: false, matrix: false },
      { path: "ci.yml", id: "check", name: "smoke", onPullRequest: true, matrix: false },
    ],
  });
});

test("handles comments, quoted names and Windows line endings", () => {
  const text = [
    "# jobs:",
    "'on': [push, 'pull_request'] # trigger",
    "jobs: # comment",
    "    # commented-out-job:",
    "  first:",
    '    name: "Build #1" # display name',
    "  second:",
    "    name: 'Run: smoke' # display name",
    "  third:",
    "    name: Type check # display name",
  ].join("\r\n");

  const result = checkRequiredNames(["Build #1", "Run: smoke", "Type check"], [{ path: "ci.yml", text }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.jobs.map(({ name }) => name), ["Build #1", "Run: smoke", "Type check"]);
});

test("reports every required name when a workflow is empty or unreadable", () => {
  for (const text of ["", "not a workflow", "# empty\n", null, undefined]) {
    assert.deepEqual(checkRequiredNames(["test", "build"], [{ path: "ci.yml", text }]), {
      ok: false,
      missing: [
        { name: "test", reason: "No job is named 'test'" },
        { name: "build", reason: "No job is named 'build'" },
      ],
      jobs: [],
    });
  }
  assert.deepEqual(checkRequiredNames([], []), { ok: true, missing: [], jobs: [] });
  assert.deepEqual(checkRequiredNames([], [{ path: "ci.yml", text: "on: pull_request\njobs:\n  test:\n" }]), {
    ok: true,
    missing: [],
    jobs: [{ path: "ci.yml", id: "test", name: "test", onPullRequest: true, matrix: false }],
  });
});

test("reports Friday's original CI job and its matrix", () => {
  const text = `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: \${{ matrix.os }}
    strategy:
      # Each platform reports on its own: one failing doesn't cancel the others.
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
`;

  const path = ".github/workflows/ci.yml";
  assert.deepEqual(checkRequiredNames(["check (ubuntu-latest)"], [{ path, text }]), {
    ok: true,
    missing: [],
    jobs: [{ path, id: "check", name: "check", onPullRequest: true, matrix: true }],
  });
});
