import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeTarget } from "../src/pomelo/merge-target.js";

const ticket = { base: "main", head: "ticket/112-p0-18", paths: ["src/pomelo/x.ts"] };

test("a ticket branch can auto-merge into main", () => {
  assert.equal(mergeTarget(ticket).verdict, "auto");
  assert.deepEqual(mergeTarget({ ...ticket, base: "refs/heads/main", head: `refs/heads/${ticket.head}` }), mergeTarget(ticket));
  for (const path of ["src/pomelo/.github-notes.ts", ".github-notes.ts", "src/pomelo/.github/x.ts", "src/file..ts"]) {
    assert.equal(mergeTarget({ ...ticket, paths: [path] }).verdict, "auto", path);
  }
});

test("config-lane paths need Amit's approval", () => {
  for (const path of [".github/workflows/ci.yml", ".GitHub\\workflows\\ci.yml", "./.github", "././.github/ISSUE_TEMPLATE/bug.yml"]) {
    assert.deepEqual(mergeTarget({ ...ticket, paths: [...ticket.paths, path, ".github/workflows/release.yml"] }), {
      verdict: "amit",
      reason: `Config path ${JSON.stringify(path)} needs Amit's approval.`,
    });
  }
});

test("other base branches and non-ticket heads need Amit's approval", () => {
  for (const base of ["import/friday-v0.3.4", "release", "live", "deploy", "Main"]) {
    assert.equal(mergeTarget({ ...ticket, base }).verdict, "amit", base);
  }
  for (const head of ["feature/x", "ticket/x-key", "ticket/112-", "ticket/112-UPPER", "ticket/112-key\n"]) {
    assert.equal(mergeTarget({ ...ticket, head }).verdict, "amit", JSON.stringify(head));
  }
});

test("main heads and matching branches are refused even for config changes", () => {
  const paths = [".github/workflows/ci.yml"];
  assert.equal(mergeTarget({ base: "release", head: "refs/heads/main", paths }).verdict, "refuse");
  assert.equal(mergeTarget({ base: "refs/heads/release", head: "release", paths }).verdict, "refuse");
});

test("empty or non-string branches and empty path lists are refused", () => {
  for (const branch of ["", "refs/heads/", null, 112]) {
    assert.equal(mergeTarget({ ...ticket, base: branch }).verdict, "refuse");
    assert.equal(mergeTarget({ ...ticket, head: branch }).verdict, "refuse");
  }
  assert.equal(mergeTarget({ ...ticket, base: "live", paths: [] }).verdict, "refuse");
});

test("traversal and absolute paths are refused before approval rules", () => {
  for (const path of ["../.github/x", "src\\..\\x.ts", "/src/x.ts", "C:\\src\\x.ts", "\\\\server\\share\\x.ts"]) {
    assert.deepEqual(mergeTarget({
      base: "live",
      head: "feature/x",
      paths: [".github/workflows/ci.yml", path, "/other.ts"],
    }), {
      verdict: "refuse",
      reason: `Changed path ${JSON.stringify(path)} must be relative and contain no '..' segment.`,
    });
  }
});
