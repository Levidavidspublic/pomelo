import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isProtectedLicencePath, licenceKeepCheck } from "../src/pomelo/licence-keep.js";

const fridayLicence = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");

test("passes a clean PR that retains Friday's licence", () => {
  assert.deepEqual(licenceKeepCheck([
    { path: "src/pomelo/example.ts", status: "added" },
    { path: "LICENSE", status: "modified", text: fridayLicence.replace(/\r?\n/g, "\r\n") },
  ]), { ok: true, problems: [] });
});

test("reports deletion of the root licence", () => {
  assert.deepEqual(licenceKeepCheck([{ path: "LICENSE", status: "deleted" }]), {
    ok: false,
    problems: [{ path: "LICENSE", reason: "deleted", message: "LICENSE was deleted." }],
  });
});

test("reports a rename using the old path even when the new path is protected", () => {
  for (const path of ["docs/credits.md", "packaging/NOTICE"]) {
    const result = licenceKeepCheck([
      { path, previousPath: "THIRD-PARTY-NOTICES.md", status: "renamed", lineCount: 5 },
    ]);
    assert.deepEqual(result, {
      ok: false,
      problems: [{
        path: "THIRD-PARTY-NOTICES.md",
        reason: "renamed",
        message: `THIRD-PARTY-NOTICES.md was renamed to ${path}.`,
      }],
    });
  }
});

test("reports an emptied patch ledger", () => {
  const result = licenceKeepCheck([{ path: "PATCHES.md", status: "modified", text: "\r\n \t\n" }]);
  assert.deepEqual(result, {
    ok: false,
    problems: [{ path: "PATCHES.md", reason: "empty", message: "PATCHES.md was emptied." }],
  });
});

test("requires Friday's copyright and MIT heading as whole lines", () => {
  const withoutCopyright = licenceKeepCheck([{
    path: "LICENSE",
    status: "modified",
    text: fridayLicence.replace(/^Copyright \(c\) 2026 Arun Dass\r?$/m, "Copyright belongs to the fork."),
  }]);
  assert.equal(withoutCopyright.ok, false);
  assert.deepEqual(withoutCopyright.problems.map(({ path, reason }) => ({ path, reason })), [
    { path: "LICENSE", reason: "missing-upstream-copyright" },
  ]);

  const withoutHeading = licenceKeepCheck([{
    path: "LICENSE",
    status: "modified",
    text: fridayLicence.replace(/^MIT License\r?$/m, "The MIT License applies."),
  }]);
  assert.equal(withoutHeading.ok, false);
  assert.deepEqual(withoutHeading.problems.map(({ reason }) => reason), ["missing-mit-heading"]);
});

test("reports a deleted nested notice", () => {
  const result = licenceKeepCheck([{ path: "packaging/NOTICE", status: "deleted" }]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path, reason }) => ({ path, reason })), [
    { path: "packaging/NOTICE", reason: "deleted" },
  ]);
});

test("passes an extended notice and an unrelated deletion", () => {
  assert.deepEqual(licenceKeepCheck([
    { path: "packaging/NOTICE", status: "modified", text: "Notices\nCredit\nTerms\nNew credit\n" },
    { path: "README.md", status: "deleted" },
  ]), { ok: true, problems: [] });
  assert.deepEqual(licenceKeepCheck([
    { path: "packaging/NOTICE", status: "modified", lineCount: 3 },
  ]), { ok: true, problems: [] });
});

test("checks new protected destinations and sorts problems by path", () => {
  const result = licenceKeepCheck([
    { path: "public/file-icons/LICENSE.md", status: "modified", lineCount: 2 },
    { path: "packaging/NOTICE", previousPath: "packaging/credits.txt", status: "renamed", lineCount: 0 },
    { path: "POMELO.md", status: "added", text: "# Pomelo\n\nAbout Pomelo\n\n", lineCount: 5 },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path, reason }) => ({ path, reason })), [
    { path: "POMELO.md", reason: "too-short" },
    { path: "packaging/NOTICE", reason: "empty" },
    { path: "public/file-icons/LICENSE.md", reason: "too-short" },
  ]);
  for (const { path, message } of result.problems) {
    assert.ok(message.startsWith(`${path} `));
    assert.ok(message.endsWith("."));
  }
});

test("reports when the input lacks the evidence for a protected change", () => {
  const result = licenceKeepCheck([
    { path: "PATCHES.md", status: "modified" },
    { path: "LICENSE", status: "modified", lineCount: 21 },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path, reason }) => ({ path, reason })), [
    { path: "LICENSE", reason: "missing-text" },
    { path: "PATCHES.md", reason: "missing-content" },
  ]);
});

test("matches repository metadata and licence basenames at any depth", () => {
  for (const path of ["LICENSE", "THIRD-PARTY-NOTICES.md", "PATCHES.md", "POMELO.md", "NOTICE", "public/file-icons/LICENSE.md", ".\\packaging\\NOTICE"]) {
    assert.equal(isProtectedLicencePath(path), true, path);
  }
  for (const path of ["docs/PATCHES.md", "packaging/NOTICE.md", "docs/LICENSE/readme.md", "docs/MY-LICENSE"]) {
    assert.equal(isProtectedLicencePath(path), false, path);
  }
});
