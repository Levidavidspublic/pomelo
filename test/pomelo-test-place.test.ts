import assert from "node:assert/strict";
import test from "node:test";
import { testPlaceFindings } from "../src/pomelo/test-place.js";

test("a top-level Pomelo test is discovered by the runner", () => {
  assert.deepEqual(testPlaceFindings([{ path: "test/pomelo-x.test.ts", status: "added" }]), []);
});

test("reports misplaced tests in input order with a reason for each path", () => {
  const files = [
    { path: "test/pomelo/x.test.ts" },
    { path: "src/pomelo/x.test.ts" },
    { path: "test/pomelo-x.spec.ts" },
    { path: "test/pomelo-x.test.js" },
    { path: "test/pomelo-x.test.tsx" },
    { path: "src/client/pomelo/view.test.ts" },
    { path: "test/x.test.ts" },
  ];

  assert.deepEqual(testPlaceFindings(files), [
    { file: files[0].path, reason: "Test is in a subfolder of test/" },
    { file: files[1].path, reason: "Test is outside test/" },
    { file: files[2].path, reason: "Test must end in .test.ts" },
    { file: files[3].path, reason: "Test must end in .test.ts" },
    { file: files[4].path, reason: "Test must end in .test.ts" },
    { file: files[5].path, reason: "Test is outside test/" },
    { file: files[6].path, reason: "Pomelo test must be named test/pomelo-<name>.test.ts" },
  ]);
});

test("fixtures, helpers, and source files produce no findings", () => {
  assert.deepEqual(testPlaceFindings([
    { path: "test/fixtures/a/b.json" },
    { path: "test/fixtures/a/sample.test.ts" },
    { path: "test/allow-probe.ts" },
    { path: "test/fake-dom.ts" },
    { path: "test/css.mjs" },
    { path: "test/ioredis-stand-in.mjs" },
    { path: "test/redis-stand-in.mjs" },
    { path: "src/pomelo/x.ts" },
  ]), []);
});

test("reports a rename out of the test root even if the new name looks like a helper", () => {
  assert.deepEqual(testPlaceFindings([
    { path: "test/unit/pomelo-x.test.ts", status: "renamed", previousPath: "test/pomelo-x.test.ts" },
    { path: "src/pomelo/x.ts", status: "renamed", previousPath: "test/pomelo-x.test.ts" },
    { path: "test/fixtures/a/sample.test.ts", previousPath: "test/pomelo-x.test.ts" },
    { path: "test/pomelo-new.test.ts", status: "renamed", previousPath: "test/pomelo-x.test.ts" },
  ]), [
    { file: "test/unit/pomelo-x.test.ts", reason: "Test is in a subfolder of test/" },
    { file: "src/pomelo/x.ts", reason: "Test is outside test/" },
    { file: "test/fixtures/a/sample.test.ts", reason: "Test is in a subfolder of test/" },
  ]);
});

test("normalizes backslashes in both the destination and source of a rename", () => {
  assert.deepEqual(testPlaceFindings([
    { path: ".\\test\\pomelo-x.test.ts" },
    { path: "test\\fixtures\\a\\sample.test.ts" },
    { path: "test\\unit\\x.ts", previousPath: "test\\pomelo-x.test.ts" },
  ]), [{ file: "test/unit/x.ts", reason: "Test is in a subfolder of test/" }]);
});

test("modified and deleted files are outside the guard's scope", () => {
  assert.deepEqual(testPlaceFindings([
    { path: "src/pomelo/x.test.ts", status: "modified" },
    { path: "test/unit/x.test.ts", status: "deleted" },
  ]), []);
});

test("an empty change list produces no findings", () => {
  assert.deepEqual(testPlaceFindings([]), []);
});
