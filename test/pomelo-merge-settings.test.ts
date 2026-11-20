import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMergeSettings } from "../src/pomelo/merge-settings.js";

const goodSettings = {
  allow_merge_commit: false,
  allow_rebase_merge: false,
  allow_squash_merge: true,
  allow_auto_merge: true,
  delete_branch_on_merge: true,
  default_branch: "main",
};

const wrongSettings = [
  { field: "allow_merge_commit", value: true, code: "merge-commit-allowed" },
  { field: "allow_rebase_merge", value: true, code: "rebase-merge-allowed" },
  { field: "allow_squash_merge", value: false, code: "squash-off" },
  { field: "allow_auto_merge", value: false, code: "auto-merge-off" },
  { field: "delete_branch_on_merge", value: false, code: "branch-not-deleted" },
  { field: "default_branch", value: "develop", code: "default-branch-not-main" },
] as const;

test("repository settings that allow squash-only merges pass", () => {
  assert.deepEqual(checkMergeSettings(JSON.stringify(goodSettings)), { ok: true, problems: [] });
});

for (const { field, value, code } of wrongSettings) {
  test(`reports only ${code} when ${field} has the wrong value`, () => {
    const result = checkMergeSettings(JSON.stringify({ ...goodSettings, [field]: value }));
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map(({ code, field }) => ({ code, field })), [{ code, field }]);
    assert.ok(result.problems[0].reason.trim());
  });

  test(`reports ${field} when missing`, () => {
    const settings: Partial<typeof goodSettings> = { ...goodSettings };
    delete settings[field];
    const result = checkMergeSettings(JSON.stringify(settings));
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map(({ code, field }) => ({ code, field })), [
      { code: "field-missing", field },
    ]);
  });
}

test("rejects malformed JSON and JSON that is not an object", () => {
  for (const jsonText of ["not JSON", "", "[]", "null", "true", "42", '"settings"']) {
    const result = checkMergeSettings(jsonText);
    assert.equal(result.ok, false, JSON.stringify(jsonText));
    assert.deepEqual(result.problems.map(({ code }) => code), ["unreadable"], JSON.stringify(jsonText));
  }
});

test("ignores unknown repository fields", () => {
  const settings = { ...goodSettings, name: "example", archived: false };
  assert.deepEqual(checkMergeSettings(JSON.stringify(settings)), { ok: true, problems: [] });
});

test("requires JSON booleans for merge flags", () => {
  const settings = { ...goodSettings, allow_merge_commit: 0, allow_squash_merge: "true" };
  const result = checkMergeSettings(JSON.stringify(settings));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ code }) => code), ["merge-commit-allowed", "squash-off"]);
});

test("reports all problems in the same order regardless of JSON field order", () => {
  const entries = wrongSettings.map(({ field, value }) => [field, value] as const);
  const result = checkMergeSettings(JSON.stringify(Object.fromEntries(entries)));
  const reversed = checkMergeSettings(JSON.stringify(Object.fromEntries(entries.reverse())));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ code, field }) => ({ code, field })),
    wrongSettings.map(({ code, field }) => ({ code, field })));
  assert.deepEqual(reversed, result);
});
