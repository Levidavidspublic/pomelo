import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUD_PROFILE_HARD_BYTES,
  CLOUD_PROFILE_WARN_BYTES,
  LOCAL_PROFILE_HARD_BYTES,
  LOCAL_PROFILE_WARN_BYTES,
  checkProfileSize,
} from "../src/pomelo/browser/profile-size.js";

const local = { id: "test-profile", location: "local" } as const;
const cloud = { ...local, location: "cloud" } as const;
const MB = 1024 * 1024;

test("a small profile is okay and totals all its reported bytes", () => {
  const result = checkProfileSize({
    ...local,
    folders: [{ name: "Cache", bytes: 2 * MB }, { name: "Other", bytes: 3 * MB }],
  });

  assert.equal(result.verdict, "ok");
  assert.equal(result.reason, undefined);
  assert.equal(result.totalBytes, 5 * MB);
  assert.equal(result.freeableBytes, 2 * MB);
  assert.match(result.message, /5 MB/);
});

test("local and cloud profiles warn only after crossing their warning limits", () => {
  for (const [profile, warnBytes, hardBytes] of [
    [local, LOCAL_PROFILE_WARN_BYTES, LOCAL_PROFILE_HARD_BYTES],
    [cloud, CLOUD_PROFILE_WARN_BYTES, CLOUD_PROFILE_HARD_BYTES],
  ] as const) {
    assert.ok(warnBytes + 1 < hardBytes);
    const check = (bytes: number) => checkProfileSize({ ...profile, folders: [{ name: "Cache", bytes }] });

    assert.equal(check(warnBytes).verdict, "ok");
    const warning = check(warnBytes + 1);
    assert.equal(warning.verdict, "warn");
    assert.match(warning.message, /clearing cache/i);
    assert.equal(check(hardBytes).verdict, "warn");
    assert.equal(check(hardBytes + 1).verdict, "hold");
  }
});

test("a profile over its hard limit is held for Amit with a size breakdown", () => {
  const result = checkProfileSize({
    ...local,
    folders: [{ name: "Other", bytes: LOCAL_PROFILE_HARD_BYTES }, { name: "Cache", bytes: 40 * MB }],
  });

  assert.equal(result.verdict, "hold");
  assert.equal(result.reason, "profile-too-big");
  assert.equal(result.totalBytes, LOCAL_PROFILE_HARD_BYTES + 40 * MB);
  assert.equal(result.freeableBytes, 40 * MB);
  assert.deepEqual(result.safeToClear, ["Cache"]);
  assert.match(result.message, /wait.*Amit/i);
  assert.match(result.message, /cache.*40 MB/i);
  assert.match(result.message, new RegExp(`other profile data.*${LOCAL_PROFILE_HARD_BYTES / MB} MB`, "i"));
});

test("the cloud hard limit holds a size the local profile can use", () => {
  assert.ok(CLOUD_PROFILE_WARN_BYTES < LOCAL_PROFILE_WARN_BYTES);
  assert.ok(CLOUD_PROFILE_HARD_BYTES < LOCAL_PROFILE_HARD_BYTES);
  const folders = [{ name: "Other", bytes: CLOUD_PROFILE_HARD_BYTES + 1 }];

  const result = checkProfileSize({ ...cloud, folders });
  assert.equal(result.verdict, "hold");
  assert.equal(result.reason, "profile-too-big");
  assert.notEqual(checkProfileSize({ ...local, folders }).verdict, "hold");
});

test("only the listed cache folders are clearable, in name order and with original casing", () => {
  const folders = Object.freeze([
    { name: "service WORKER/cachestorage", bytes: 4 },
    { name: "GpuCACHE", bytes: 3 },
    { name: "Code Cache", bytes: 2 },
    { name: "cACHE", bytes: 1 },
    { name: "Cookies", bytes: 10 },
    { name: "Login Data", bytes: 10 },
    { name: "Local Storage", bytes: 10 },
    { name: "Other", bytes: 10 },
    { name: "Service Worker", bytes: 10 },
  ]);
  const result = checkProfileSize({ ...local, folders });

  assert.equal(result.totalBytes, 60);
  assert.equal(result.freeableBytes, 10);
  assert.deepEqual(result.safeToClear, ["Code Cache", "GpuCACHE", "cACHE", "service WORKER/cachestorage"]);
});

test("clearable names are exact allowlist matches from the report", () => {
  const folders = ["/example/Cache", "../Cache", "Other/Cache", "Other\\Cache", "Cache/Other", "Cache "]
    .map((name) => ({ name, bytes: 1 }));
  const result = checkProfileSize({ ...local, id: "synthetic-profile-id", folders });

  assert.deepEqual(result.safeToClear, []);
  assert.equal(result.freeableBytes, 0);
  assert.deepEqual(result, checkProfileSize({ ...local, folders: [{ name: "Other", bytes: folders.length }] }));
});

test("invalid byte counts hold the profile and suppress partial cache results", () => {
  for (const size of [{ bytes: -1 }, { bytes: NaN }, {}, { bytes: Infinity }, { bytes: 0.5 }]) {
    const result = checkProfileSize({
      ...local,
      folders: [{ name: "Cache", bytes: MB }, { name: "Other", ...size }],
    });

    assert.equal(result.verdict, "hold");
    assert.equal(result.reason, "bad-report");
    assert.equal(result.totalBytes, 0);
    assert.equal(result.freeableBytes, 0);
    assert.deepEqual(result.safeToClear, []);
  }
});

test("an empty folder list is okay with zero bytes", () => {
  const result = checkProfileSize({ ...cloud, folders: [] });

  assert.equal(result.verdict, "ok");
  assert.equal(result.totalBytes, 0);
  assert.equal(result.freeableBytes, 0);
  assert.deepEqual(result.safeToClear, []);
});
