import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWorkflowToken } from "../src/pomelo/workflow-token.js";

const safeSettings = {
  enabled: true,
  allowed_actions: "selected",
  default_workflow_permissions: "read",
  can_approve_pull_request_reviews: false,
};

test("accepts selected or local-only actions with restricted workflow permissions", () => {
  for (const allowed_actions of ["selected", "local_only"]) {
    const jsonText = JSON.stringify({ ...safeSettings, allowed_actions });
    assert.deepEqual(checkWorkflowToken(jsonText), { ok: true, findings: [] });
  }
});

const unsafeSettings = [
  ["default_workflow_permissions", "write", /read.only/i],
  ["can_approve_pull_request_reviews", true, /approve pull requests/i],
  ["allowed_actions", "all", /selected.*local_only/i],
  ["enabled", false, /gates.*run/i],
] as const;

for (const [setting, value, reason] of unsafeSettings) {
  test(`reports an unsafe ${setting} setting`, () => {
    const result = checkWorkflowToken(JSON.stringify({ ...safeSettings, [setting]: value }));
    assert.equal(result.ok, false);
    assert.deepEqual(result.findings.map((finding) => finding.setting), [setting]);
    assert.match(result.findings[0].reason, reason);
  });

  test(`reports a missing ${setting} setting`, () => {
    const { [setting]: omitted, ...incomplete } = safeSettings;
    const result = checkWorkflowToken(JSON.stringify(incomplete));
    assert.equal(result.ok, false);
    assert.deepEqual(result.findings.map((finding) => finding.setting), [setting]);
    assert.match(result.findings[0].reason, /missing/i);
  });
}

test("rejects unexpected values for all required settings", () => {
  const result = checkWorkflowToken(JSON.stringify({
    default_workflow_permissions: null,
    can_approve_pull_request_reviews: "false",
    allowed_actions: "unknown",
    enabled: 1,
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ setting }) => setting), unsafeSettings.map(([setting]) => setting));
});

test("reports broken JSON with one json finding", () => {
  const result = checkWorkflowToken("{");
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ setting }) => setting), ["json"]);
  assert.match(result.findings[0].reason, /valid JSON/i);
});

test("reports non-object JSON with one json finding", () => {
  for (const jsonText of ["[]", "null", '"text"', "true", "42"]) {
    const result = checkWorkflowToken(jsonText);
    assert.equal(result.ok, false);
    assert.deepEqual(result.findings.map(({ setting }) => setting), ["json"]);
    assert.match(result.findings[0].reason, /JSON object/i);
  }
});

test("reports two problems in the same order regardless of JSON key order", () => {
  for (const jsonText of [
    '{"enabled":true,"allowed_actions":"selected","can_approve_pull_request_reviews":true,"default_workflow_permissions":"write"}',
    '{"default_workflow_permissions":"write","can_approve_pull_request_reviews":true,"allowed_actions":"selected","enabled":true}',
  ]) {
    const result = checkWorkflowToken(jsonText);
    assert.equal(result.ok, false);
    assert.deepEqual(result.findings.map(({ setting }) => setting), [
      "default_workflow_permissions",
      "can_approve_pull_request_reviews",
    ]);
  }
});
