import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lockProblems } from "../src/pomelo/lock-guard.js";

const example = {
  version: "1.0.0",
  resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
  integrity: "sha512-Zml4dHVyZQ==",
};

function lock(packages: Record<string, unknown> = { "node_modules/example": example }) {
  return { lockfileVersion: 3, packages };
}

test("equal lockfiles give no problems despite object key order", () => {
  const before = lock({
    "": { name: "fixture", version: "1.0.0" },
    "node_modules/example": example,
  });
  const after = lock({
    "node_modules/example": {
      integrity: example.integrity,
      resolved: example.resolved,
      version: example.version,
    },
    "": { version: "1.0.0", name: "fixture" },
  });
  assert.deepEqual(lockProblems({ before, after, packageJsonChanged: false }), []);
});

test("a lock-only addition names the package", () => {
  const before = lock();
  const after = lock({ ...before.packages, "node_modules/@fixture/added": example });
  assert.deepEqual(lockProblems({ before, after, packageJsonChanged: false }), [
    { kind: "lock-only-change", name: "@fixture/added", detail: "" },
  ]);
});

test("lock-only edits and removals name the affected packages", () => {
  const before = lock({
    "node_modules/example": example,
    "node_modules/example/node_modules/@fixture/child": example,
  });
  const after = lock({ "node_modules/example": { ...example, dev: true } });
  assert.deepEqual(lockProblems({ before, after, packageJsonChanged: false }), [
    { kind: "lock-only-change", name: "@fixture/child", detail: "" },
    { kind: "lock-only-change", name: "example", detail: "" },
  ]);
});

test("lock-only changes to root metadata name the lockfile", () => {
  const before = { ...lock(), requires: true };
  const after = { ...lock(), requires: false };
  assert.deepEqual(lockProblems({ before, after, packageJsonChanged: false }), [
    { kind: "lock-only-change", name: "package-lock.json", detail: "" },
  ]);
});

test("reports only the hostname for a URL outside the npm registry", () => {
  const after = lock({
    "node_modules/example": {
      ...example,
      resolved: "https://registry.example/releases/example.tgz?fixture=sample#fragment",
    },
  });
  assert.deepEqual(lockProblems({ before: lock(), after, packageJsonChanged: true }), [
    { kind: "outside-registry", name: "example", detail: "registry.example" },
  ]);
});

test("rejects git, file, HTTP, and malformed resolutions", () => {
  const after = lock({
    "node_modules/plain": { ...example, resolved: "http://registry.npmjs.org/plain.tgz" },
    "node_modules/local": { ...example, resolved: "file:../local.tgz" },
    "node_modules/git": { ...example, resolved: "git+ssh://git.example/project.git" },
    "node_modules/broken": { ...example, resolved: "https://[invalid" },
  });
  assert.deepEqual(lockProblems({ before: lock({}), after, packageJsonChanged: true }), [
    { kind: "outside-registry", name: "broken", detail: "" },
    { kind: "outside-registry", name: "git", detail: "git.example" },
    { kind: "outside-registry", name: "local", detail: "" },
    { kind: "outside-registry", name: "plain", detail: "registry.npmjs.org" },
  ]);
});

test("requires the exact HTTPS npm registry even for existing entries", () => {
  const unchanged = lock({
    "node_modules/port": { ...example, resolved: "https://registry.npmjs.org:8443/port.tgz" },
    "node_modules/lookalike": { ...example, resolved: "https://registry.npmjs.org.example/lookalike.tgz" },
  });
  assert.deepEqual(lockProblems({ before: unchanged, after: unchanged, packageJsonChanged: false }), [
    { kind: "outside-registry", name: "lookalike", detail: "registry.npmjs.org.example" },
    { kind: "outside-registry", name: "port", detail: "registry.npmjs.org" },
  ]);
});

test("a package that loses integrity is reported, and problems sort by name then kind", () => {
  const before = lock();
  const after = lock({
    "node_modules/example": { version: example.version, resolved: "https://registry.example/example.tgz" },
    "node_modules/another": example,
  });
  assert.deepEqual(lockProblems({ before, after, packageJsonChanged: false }), [
    { kind: "lock-only-change", name: "another", detail: "" },
    { kind: "lock-only-change", name: "example", detail: "" },
    { kind: "no-integrity", name: "example", detail: "" },
    { kind: "outside-registry", name: "example", detail: "registry.example" },
  ]);
});

test("reports lockfile versions that change or remain unsupported", () => {
  const unsupported = { ...lock(), lockfileVersion: 2 };
  assert.deepEqual(lockProblems({ before: lock(), after: unsupported, packageJsonChanged: true }), [
    { kind: "lockfile-version", name: "package-lock.json", detail: "3 -> 2" },
  ]);
  assert.deepEqual(lockProblems({ before: unsupported, after: unsupported, packageJsonChanged: false }), [
    { kind: "lockfile-version", name: "package-lock.json", detail: "2" },
  ]);
});

test("malformed lockfiles give one unreadable problem", () => {
  const malformed = [null, [], 42, { lockfileVersion: 3 }, { lockfileVersion: 3, packages: [] }, lock({ example: null })];
  for (const value of malformed) {
    const unreadable = [{ kind: "lockfile-version", name: "package-lock.json", detail: "unreadable" }];
    assert.deepEqual(lockProblems({ before: value, after: lock(), packageJsonChanged: false }), unreadable);
    assert.deepEqual(lockProblems({ before: lock(), after: value, packageJsonChanged: false }), unreadable);
  }
});

test("a removal with a changed manifest gives no problems", () => {
  assert.deepEqual(lockProblems({ before: lock(), after: lock({}), packageJsonChanged: true }), []);
});

test("the repository package-lock.json gives no problems against itself", () => {
  const baseline: unknown = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.deepEqual(lockProblems({ before: baseline, after: baseline, packageJsonChanged: false }), []);
});
