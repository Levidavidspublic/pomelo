import assert from "node:assert/strict";
import { posix } from "node:path";
import test from "node:test";
import { CLOUD_PROFILE_ROOT, profileDir, profileRoot } from "../src/pomelo/browser/profile-path.js";

const local = { id: "work-1", location: "local", home: "/tmp/pomelo-home" } as const;
const cloud = { ...local, location: "cloud" } as const;

test("local profiles live under the supplied home", () => {
  assert.equal(profileRoot(local.location, local.home), "/tmp/pomelo-home/profiles");
  assert.deepEqual(profileDir(local), { ok: true, dir: "/tmp/pomelo-home/profiles/work-1" });
});

test("cloud profiles live under the fixed VPS profile root", () => {
  assert.equal(CLOUD_PROFILE_ROOT, "/data/cloud-browser/profile");
  assert.equal(profileRoot(cloud.location, cloud.home), CLOUD_PROFILE_ROOT);
  assert.deepEqual(profileDir(cloud), { ok: true, dir: "/data/cloud-browser/profile/work-1" });
});

test("invalid profile IDs are refused", () => {
  const invalidIds = [
    "..", "../x", "a/b", "a\\b", "", "a\0b", ".hidden", "/absolute", "a".repeat(65),
    "Work-1", "-work", "work_1", "work-1\n",
  ];
  for (const id of invalidIds) {
    assert.deepEqual(profileDir({ ...local, id }), { ok: false, reason: "bad-id" }, JSON.stringify(id));
  }
});

test("taken IDs are compared without regard to case", () => {
  const refusal = { ok: false, reason: "taken" };
  assert.deepEqual(profileDir({ ...local, taken: ["WORK-1"] }), refusal);
  assert.deepEqual(profileDir({ ...local, taken: ["work-1"] }), refusal);
  assert.deepEqual(profileDir({ ...local, taken: ["work-10"] }), profileDir(local));
});

test("relative or empty homes are refused", () => {
  for (const input of [local, cloud]) {
    for (const home of ["relative/home", ""]) {
      assert.deepEqual(profileDir({ ...input, home }), { ok: false, reason: "bad-home" });
    }
  }
});

test("resolved profile directories stay below their resolved roots", () => {
  const home = "/tmp/other/../pomelo-home//";
  for (const { location } of [local, cloud]) {
    const root = posix.resolve(profileRoot(location, home));
    for (const id of ["0", "work-1", "a".repeat(64)]) {
      const result = profileDir({ id, location, home });
      assert.ok(result.ok);
      assert.ok(posix.resolve(result.dir).startsWith(root + posix.sep));
    }
  }
});

test("serialized refusals contain only status and reason", () => {
  const invalidId = "../sample-profile";
  const takenId = "sample-profile";
  const invalidHome = "sample-home";
  assert.equal(JSON.stringify(profileDir({ ...local, id: invalidId })), '{"ok":false,"reason":"bad-id"}');
  assert.equal(JSON.stringify(profileDir({ ...local, id: takenId, taken: [takenId] })),
    '{"ok":false,"reason":"taken"}');
  assert.equal(JSON.stringify(profileDir({ ...local, id: takenId, home: invalidHome })),
    '{"ok":false,"reason":"bad-home"}');
});
