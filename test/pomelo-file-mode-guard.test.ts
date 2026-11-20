import assert from "node:assert/strict";
import test from "node:test";
import { checkFileModes } from "../src/pomelo/file-mode-guard.js";

test("reports added symlinks, submodules, and executable files in diff order", () => {
  const raw = [
    ":000000 120000 0000000 a1b2c3d A\tlinks/current",
    ":000000 160000 0000000 a1b2c3d A\tvendor/project",
    ":000000 100755 0000000 a1b2c3d A\tbin/start",
    ":100644 100755 a1b2c3d a1b2c3d M\tbin/build",
    ":120000 120000 a1b2c3d b1c2d3e M\tlinks/updated",
    ":160000 160000 a1b2c3d b1c2d3e M\tvendor/updated",
  ].join("\n") + "\n";

  const { ok, findings } = checkFileModes(raw);
  assert.equal(ok, false);
  assert.deepEqual(findings.map(({ path, kind }) => ({ path, kind })), [
    { path: "links/current", kind: "symlink" },
    { path: "vendor/project", kind: "submodule" },
    { path: "bin/start", kind: "executable" },
    { path: "bin/build", kind: "executable" },
    { path: "links/updated", kind: "symlink" },
    { path: "vendor/updated", kind: "submodule" },
  ]);
  for (const { reason } of findings) assert.ok(reason.trim());
});

test("uses the destination path for scored renames and copies", () => {
  const raw = [
    ':120000 120000 a1b2c3d a1b2c3d R100\tlinks/old name\t"links/new name"',
    ":100755 100755 a1b2c3d a1b2c3d C100\tbin/start\tbin/start copy",
  ].join("\r\n");

  const { findings } = checkFileModes(raw);
  assert.deepEqual(findings.map(({ path, kind }) => ({ path, kind })), [
    { path: "links/new name", kind: "symlink" },
    { path: "bin/start copy", kind: "executable" },
  ]);
});

test("reads literal Hebrew and Git's quoted UTF-8 bytes and path escapes", () => {
  const raw = [
    ":000000 120000 0000000 a1b2c3d A\tlinks/שלום",
    ':000000 120000 0000000 a1b2c3d A\t"links/\\327\\251\\327\\234\\327\\225\\327\\235\\t\\"copy\\"\\\\suffix"',
  ].join("\n");

  const { findings } = checkFileModes(raw);
  assert.deepEqual(findings.map(({ path }) => path), [
    "links/שלום",
    'links/שלום\t"copy"\\suffix',
  ]);
});

test("passes empty input, ordinary files, deletions, and existing executable modes", () => {
  const raw = [
    ":000000 100644 0000000 a1b2c3d A\tplain file.txt",
    ":120000 000000 a1b2c3d 0000000 D\tlinks/removed",
    ":160000 000000 a1b2c3d 0000000 D\tvendor/removed",
    ":100755 100755 a1b2c3d b1c2d3e M\tbin/updated",
    ":100755 100755 a1b2c3d a1b2c3d R100\tbin/old\tbin/renamed",
  ].join("\n");

  assert.deepEqual(checkFileModes(raw), { ok: true, findings: [] });
  assert.deepEqual(checkFileModes(""), { ok: true, findings: [] });
});

test("reports every unreadable line and keeps checking the rest of the diff", () => {
  const raw = [
    "garbage line",
    ":120000 120000 a1b2c3d a1b2c3d R100\tlinks/missing destination",
    ':000000 100644 0000000 a1b2c3d A\t"unclosed',
    "",
    ":000000 100644 0000000 a1b2c3d A\tfile\tunexpected path",
    ":000000 120000 0000000 a1b2c3d A\tlinks/after",
  ].join("\n") + "\n";

  const { ok, findings } = checkFileModes(raw);
  assert.equal(ok, false);
  assert.deepEqual(findings.map(({ kind }) => kind), [
    "unreadable", "unreadable", "unreadable", "unreadable", "unreadable", "symlink",
  ]);
  for (const [index, finding] of findings.slice(0, 5).entries()) {
    assert.match(finding.reason, new RegExp("line " + (index + 1) + "\\b"));
  }
  assert.equal(findings[5].path, "links/after");
});
