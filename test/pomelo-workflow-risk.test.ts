import assert from "node:assert/strict";
import test from "node:test";
import { WORKFLOW_RISK_RULES, workflowRisk } from "../src/pomelo/workflow-risk.js";

const file = "ci.yml";
const stepPrefix = ["on: pull_request", "jobs:", "  check:", "    runs-on: ubuntu-latest", "    steps:"];

const findings = (...lines: string[]) => workflowRisk(file, lines.join("\n"));
const locations = (...lines: string[]) => findings(...lines).map(({ line, rule }) => ({ line, rule }));

test("accepts a Friday-style CI workflow", () => {
  assert.deepEqual(findings(
    "name: CI",
    "on:",
    "  push:",
    "    branches: [main]",
    "  pull_request:",
    ...stepPrefix.slice(1),
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    "      - run: npm ci",
    "      - run: npm run typecheck",
    "      - run: npm test",
  ), []);
});

test("locates pull_request_target in scalar, list, and mapping triggers", () => {
  for (const lines of [
    ["on: pull_request_target # review"],
    ["'on': [push, 'pull_request_target']"],
    ["on: {push: {}, pull_request_target: {}}"],
    ["on:", "- push", "- pull_request_target"],
    ["on:", "  pull_request_target:", "    types: [opened]"],
  ]) {
    const line = lines.findIndex((text) => text.includes("pull_request_target")) + 1;
    assert.deepEqual(locations(...lines), [{ line, rule: "pull-request-target" }]);
  }
});

test("ignores mentions outside trigger declarations", () => {
  assert.deepEqual(findings(
    "# on: pull_request_target",
    "name: pull_request_target",
    "on:",
    "  pull_request:",
    "    branches: [pull_request_target] # pull_request_target",
    ...stepPrefix.slice(1),
    "      - run: echo pull_request_target",
  ), []);
});

test("locates write-all and workflow-level contents: write", () => {
  assert.deepEqual(locations(
    "permissions:",
    "  contents: write",
    "on: [push, pull_request]",
    "jobs:",
    "  first:",
    "    permissions: 'write-all' # review",
    "  second:",
    "    permissions:",
    "      contents: write",
  ), [
    { line: 2, rule: "write-permissions" },
    { line: 6, rule: "write-permissions" },
  ]);
  assert.deepEqual(locations("on: push", "permissions: write-all"), [{ line: 2, rule: "write-permissions" }]);
  assert.deepEqual(locations("on: pull_request", "permissions: {contents: write}"), [{ line: 2, rule: "write-permissions" }]);
  assert.deepEqual(findings("on: push", "permissions:", "  contents: write"), []);
});

test("locates failures allowed on test and typecheck steps", () => {
  assert.deepEqual(locations(
    ...stepPrefix,
    "      - name: Test",
    "        continue-on-error: true",
    "        run: npm test",
    "      - run: npm run typecheck || true # review",
    "      - run: |",
    "          npm test -- test/check.test.ts || true",
    "      - run: npm run build || true",
    "        continue-on-error: true",
    "      - if: always()",
    "        run: npm test",
    "      - run: npm run typecheck # || true",
  ), [
    { line: 7, rule: "ignored-check-failure" },
    { line: 9, rule: "ignored-check-failure" },
    { line: 11, rule: "ignored-check-failure" },
  ]);
});

test("locates third-party actions pinned to tags, branches, or short commits", () => {
  assert.deepEqual(locations(
    ...stepPrefix,
    "    - uses: 'example/tool@v2' # review",
    "    - name: Tool",
    "      uses: example/tool@main",
    "    - uses: example/tool@abcdef1",
    "    - uses: actions/checkout@v4",
    "    - uses: ./.github/actions/local",
    "    - uses: example/tool@0123456789abcdef0123456789abcdef01234567",
    "    - run: |",
    "        # uses: example/tool@v2",
    '        echo "uses: example/tool@v2"',
  ), [
    { line: 6, rule: "unpinned-action" },
    { line: 8, rule: "unpinned-action" },
    { line: 9, rule: "unpinned-action" },
  ]);
});

test("reports only the variable name from a pull_request secret reference", () => {
  assert.deepEqual(findings(
    ...stepPrefix,
    "      - env:",
    "          INPUT: ${{ secrets.NAME || 'fixture-only' }} # also ${{ secrets.COMMENT }}",
    "        run: npm ci",
  ), [{ file, line: 7, rule: "pull-request-secret", reason: "Pull request workflow references secret NAME." }]);
  assert.deepEqual(findings("on: push", "env:", "  INPUT: ${{ secrets.NAME }}"), []);
});

test("locates release and publish commands on their physical lines", () => {
  assert.deepEqual(locations(
    ...stepPrefix,
    "      - run: npm publish --dry-run",
    "      - run: npx electron-builder --linux --publish always",
    "      - run: |",
    "          if ! gh release view example; then",
    "            gh release create example",
    '            echo "npm publish"',
    "            # gh release delete example",
    "          fi",
    "      - run: electron-builder --publish never",
  ), [
    { line: 6, rule: "release-or-publish" },
    { line: 7, rule: "release-or-publish" },
    { line: 9, rule: "release-or-publish" },
    { line: 10, rule: "release-or-publish" },
    { line: 14, rule: "release-or-publish" },
  ]);
});

test("exports the frozen rule names and accepts empty input", () => {
  assert.ok(Object.isFrozen(WORKFLOW_RISK_RULES));
  assert.deepEqual(WORKFLOW_RISK_RULES, [
    "pull-request-target",
    "write-permissions",
    "ignored-check-failure",
    "unpinned-action",
    "pull-request-secret",
    "release-or-publish",
  ]);
  assert.deepEqual(workflowRisk(file, ""), []);
});
