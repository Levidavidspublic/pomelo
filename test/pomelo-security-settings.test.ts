import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSecuritySettings, REQUIRED_SECURITY_SETTINGS } from "../src/pomelo/security-settings.js";

const requiredSettings = [
  "secret_scanning",
  "secret_scanning_push_protection",
  "dependabot_security_updates",
] as const;
const allEnabled = {
  secret_scanning: { status: "enabled" },
  secret_scanning_push_protection: { status: "enabled" },
  dependabot_security_updates: { status: "enabled" },
  private_vulnerability_reporting: { status: "enabled" },
};

function repositoryJson(security_and_analysis: unknown): string {
  return JSON.stringify({ security_and_analysis });
}

test("accepts a repository with all security settings enabled", () => {
  const { private_vulnerability_reporting: omitted, ...requiredOnly } = allEnabled;
  for (const settings of [allEnabled, requiredOnly]) {
    assert.deepEqual(checkSecuritySettings(repositoryJson(settings)), { ok: true, findings: [] });
  }
});

test("exports the frozen list of required settings in finding order", () => {
  assert.deepEqual(REQUIRED_SECURITY_SETTINGS, requiredSettings);
  assert.equal(Object.isFrozen(REQUIRED_SECURITY_SETTINGS), true);
});

for (const setting of [...requiredSettings, "private_vulnerability_reporting"]) {
  test(`names ${setting} when it is disabled`, () => {
    const jsonText = repositoryJson({ ...allEnabled, [setting]: { status: "disabled" } });
    assert.deepEqual(checkSecuritySettings(jsonText), {
      ok: false,
      findings: [{ setting, problem: "off" }],
    });
  });
}

test("reports a missing security_and_analysis block", () => {
  assert.deepEqual(checkSecuritySettings("{}"), {
    ok: false,
    findings: [{ setting: "settings_missing", problem: "missing" }],
  });
});

test("counts missing settings and statuses other than enabled as off", () => {
  for (const secret_scanning of [undefined, {}, { status: null }, { status: true }, { status: "Enabled" }]) {
    assert.deepEqual(checkSecuritySettings(repositoryJson({ ...allEnabled, secret_scanning })), {
      ok: false,
      findings: [{ setting: "secret_scanning", problem: "off" }],
    });
  }
});

test("reports unreadable JSON and non-object repository data", () => {
  for (const jsonText of ["not JSON", "[]", "null", "false", "42", '"text"']) {
    assert.deepEqual(checkSecuritySettings(jsonText), {
      ok: false,
      findings: [{ setting: "json", problem: "unreadable" }],
    });
  }
});

test("reports a security_and_analysis block of the wrong shape as unreadable", () => {
  for (const block of [null, [], true, "enabled"]) {
    assert.deepEqual(checkSecuritySettings(repositoryJson(block)), {
      ok: false,
      findings: [{ setting: "security_and_analysis", problem: "unreadable" }],
    });
  }
});

test("returns frozen findings in a fixed order regardless of JSON key order", () => {
  const settings = {
    private_vulnerability_reporting: { status: "disabled" },
    dependabot_security_updates: { status: "disabled" },
    secret_scanning_push_protection: { status: "disabled" },
    secret_scanning: { status: "disabled" },
  };
  const result = checkSecuritySettings(repositoryJson(settings));
  assert.deepEqual(result, {
    ok: false,
    findings: [
      { setting: "secret_scanning", problem: "off" },
      { setting: "secret_scanning_push_protection", problem: "off" },
      { setting: "dependabot_security_updates", problem: "off" },
      { setting: "private_vulnerability_reporting", problem: "off" },
    ],
  });
  assert.equal(Object.isFrozen(result.findings), true);
});

test("returns only known setting names and problem codes", () => {
  const jsonText = repositoryJson({
    ...allEnabled,
    secret_scanning: { status: "fixture status", description: "fixture description" },
    unrelated_fixture: { status: "disabled" },
  });
  assert.deepEqual(checkSecuritySettings(jsonText), {
    ok: false,
    findings: [{ setting: "secret_scanning", problem: "off" }],
  });
});
