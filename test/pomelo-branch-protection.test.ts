import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBranchProtection } from "../src/pomelo/branch-protection.js";

const requiredChecks = ["test", "typecheck"];
const protectedMain = `{
  "required_status_checks": { "strict": true, "contexts": ["test", "typecheck"] },
  "allow_force_pushes": { "enabled": false },
  "allow_deletions": { "enabled": false },
  "enforce_admins": { "enabled": true }
}`;

test("accepts a fully protected main using the legacy contexts list", () => {
  assert.deepEqual(checkBranchProtection(protectedMain, requiredChecks), { ok: true, findings: [] });
});

test("reads check contexts from the newer list and from both lists together", () => {
  const newer = protectedMain.replace('"contexts": ["test", "typecheck"]',
    '"checks": [{ "context": "test" }, { "context": "typecheck" }]');
  const mixed = protectedMain.replace('"contexts": ["test", "typecheck"]',
    '"contexts": ["test"], "checks": [{ "context": "typecheck" }]');

  for (const jsonText of [newer, mixed]) {
    assert.deepEqual(checkBranchProtection(jsonText, requiredChecks), { ok: true, findings: [] });
  }
});

test("names each missing required check using exact check names", () => {
  const jsonText = protectedMain.replace('["test", "typecheck"]', '["Test", "lint"]');

  assert.deepEqual(checkBranchProtection(jsonText, requiredChecks), {
    ok: false,
    findings: [
      { setting: "required_status_checks", reason: 'Required status check "test" is missing.' },
      { setting: "required_status_checks", reason: 'Required status check "typecheck" is missing.' },
    ],
  });
});

test("reports a missing required status checks setting", () => {
  const jsonText = protectedMain.replace('"required_status_checks": { "strict": true, "contexts": ["test", "typecheck"] },', "");

  assert.deepEqual(checkBranchProtection(jsonText, requiredChecks), {
    ok: false,
    findings: [{ setting: "required_status_checks", reason: "Main must require status checks." }],
  });
});

test("reports unsafe settings in a steady order", () => {
  const jsonText = `{
    "enforce_admins": { "enabled": false },
    "allow_deletions": { "enabled": true },
    "allow_force_pushes": { "enabled": true },
    "required_status_checks": { "strict": false, "contexts": ["test", "typecheck"] }
  }`;

  assert.deepEqual(checkBranchProtection(jsonText, requiredChecks), {
    ok: false,
    findings: [
      { setting: "required_status_checks.strict", reason: "Branches must be up to date before merging." },
      { setting: "allow_force_pushes", reason: "Force pushes must be disabled on main." },
      { setting: "allow_deletions", reason: "Deletion of main must be disabled." },
      { setting: "enforce_admins", reason: "Branch protection must apply to administrators." },
    ],
  });
});

test("rejects invalid JSON with one finding", () => {
  assert.deepEqual(checkBranchProtection("not JSON", requiredChecks), {
    ok: false,
    findings: [{ setting: "json", reason: "Branch protection settings must be valid JSON." }],
  });
});

test("rejects non-object JSON with one finding", () => {
  for (const jsonText of ['"text"', "42", "false", "null", "[]"]) {
    assert.deepEqual(checkBranchProtection(jsonText, requiredChecks), {
      ok: false,
      findings: [{ setting: "json", reason: "Branch protection settings must be a JSON object." }],
    });
  }
});

test("rejects an empty required check list with one finding", () => {
  assert.deepEqual(checkBranchProtection(protectedMain, []), {
    ok: false,
    findings: [{ setting: "requiredChecks", reason: "Provide at least one required check name." }],
  });
});
