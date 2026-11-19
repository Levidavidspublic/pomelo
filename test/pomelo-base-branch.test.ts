import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBaseBranch, type BaseBranchInput } from "../src/pomelo/base-branch.js";

const importBranch = "import/friday-v0.3.4";
const ticket: BaseBranchInput = {
  prBase: importBranch,
  prHead: "ticket/209-p0-34",
  importBranch,
  mainBranch: "main",
  importMerged: false,
  needsFriday: true,
};

test("tickets that need Friday stack on the import branch until it is merged", () => {
  assert.deepEqual(checkBaseBranch(ticket), { ok: true, expectedBase: importBranch, reason: "ok" });
  assert.deepEqual(checkBaseBranch({ ...ticket, prBase: "main" }), {
    ok: false, expectedBase: importBranch, reason: "should_stack_on_import",
  });
});

test("tickets that need Friday target main after the import is merged", () => {
  const merged = { ...ticket, importMerged: true };
  assert.deepEqual(checkBaseBranch(merged), {
    ok: false, expectedBase: "main", reason: "should_target_main",
  });
  assert.deepEqual(checkBaseBranch({ ...merged, prBase: "main" }), {
    ok: true, expectedBase: "main", reason: "ok",
  });
});

test("tickets that do not need Friday can target main before or after the merge", () => {
  for (const importMerged of [false, true]) {
    assert.deepEqual(checkBaseBranch({ ...ticket, prBase: "main", needsFriday: false, importMerged }), {
      ok: true, expectedBase: "main", reason: "ok",
    });
  }
});

test("matching head and base branches are refused", () => {
  assert.deepEqual(checkBaseBranch({ ...ticket, prHead: `refs/heads/${ticket.prBase}` }), {
    ok: false, expectedBase: importBranch, reason: "head_equals_base",
  });
});

test("bases outside the configured import and main branches are refused", () => {
  for (const prBase of ["release", "origin/production"]) {
    assert.deepEqual(checkBaseBranch({ ...ticket, prBase }), {
      ok: false, expectedBase: importBranch, reason: "base_is_live_branch",
    });
  }
});

test("empty, missing, and incorrectly typed fields give bad_input", () => {
  const badInput = { ok: false, expectedBase: null, reason: "bad_input" };
  for (const field of ["prBase", "prHead", "importBranch", "mainBranch"]) {
    for (const value of ["", "   ", "refs/heads/", "origin/", undefined, 209]) {
      assert.deepEqual(checkBaseBranch({ ...ticket, [field]: value }), badInput, field);
    }
  }
  for (const field of ["importMerged", "needsFriday"]) {
    for (const value of [undefined, "false"]) {
      assert.deepEqual(checkBaseBranch({ ...ticket, [field]: value }), badInput, field);
    }
  }
  for (const input of [{}, null, undefined]) {
    assert.deepEqual(checkBaseBranch(input as BaseBranchInput), badInput);
  }
});

test("refs/heads and origin prefixes are normalized on all branch names", () => {
  assert.deepEqual(checkBaseBranch({
    ...ticket,
    prBase: `refs/heads/${importBranch}`,
    prHead: `origin/${ticket.prHead}`,
    importBranch: `origin/${importBranch}`,
    mainBranch: "refs/heads/main",
  }), { ok: true, expectedBase: importBranch, reason: "ok" });

  assert.deepEqual(checkBaseBranch({
    ...ticket,
    prBase: "origin/trunk",
    mainBranch: "refs/heads/trunk",
    importMerged: true,
  }), { ok: true, expectedBase: "trunk", reason: "ok" });
});
