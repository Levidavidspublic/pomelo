import assert from "node:assert/strict";
import test from "node:test";
import { isPomeloPath, ledgerFiles, unlistedPatches } from "../src/pomelo/patch-ledger.js";

const ledger = [
  "| File | Hook | Reason | Ticket |",
  "| --- | --- | --- | --- |",
  "| `src/agent-mesh.ts` | Added the nullable `pomelo` field and hooks in `listingFor` and `callOne` (7 lines). | Pomelo thread tools reach the mesh without forking Friday's dispatch switch. | #17 |",
].join("\n");

test("reports Friday changes that have no ledger row", () => {
  assert.deepEqual(unlistedPatches(["src/agent-mesh.ts"], ledger), []);
  assert.deepEqual(unlistedPatches(["src/agent-mesh.ts", "src/app.ts"], ledger), ["src/app.ts"]);
});

test("exempts Pomelo paths from the ledger", () => {
  const pomeloPaths = [
    "src/pomelo/patch-ledger.ts",
    "src/client/pomelo/panel.tsx",
    "test/pomelo-patch-ledger.test.ts",
    "PATCHES.md",
    "THIRD-PARTY-NOTICES.md",
    "POMELO.md",
    "docs/harness/02-TRD.md",
  ];

  for (const path of pomeloPaths) {
    assert.equal(isPomeloPath(path), true, path);
  }
  assert.equal(isPomeloPath("src/app.ts"), false);
  assert.equal(isPomeloPath("src/pomelo-extra.ts"), false);
  assert.equal(isPomeloPath("test/pomelo-fixtures/helper.ts"), false);
  assert.deepEqual(unlistedPatches(pomeloPaths, ""), []);
});

test("reads only the first backticked path in the first table cell", () => {
  const ledgerWithOtherText = [
    "See `src/app.ts` for details.",
    ledger,
    "| src/app.ts | Hook for `src/app.ts` | Reason | #68 |",
    "| `src/room.ts` and `src/app.ts` | Hook | Reason | #68 |",
  ].join("\n");

  assert.deepEqual(ledgerFiles(ledgerWithOtherText), ["src/agent-mesh.ts", "src/room.ts"]);
  assert.deepEqual(unlistedPatches(["src/app.ts"], ledgerWithOtherText), ["src/app.ts"]);
});

test("compares backslash paths as forward-slash paths", () => {
  const windowsLedger = ledger.replace("src/agent-mesh.ts", "src\\agent-mesh.ts");

  assert.deepEqual(ledgerFiles(windowsLedger), ["src/agent-mesh.ts"]);
  assert.deepEqual(unlistedPatches(["src/agent-mesh.ts"], windowsLedger), []);
  assert.deepEqual(unlistedPatches(["src\\agent-mesh.ts", "src\\app.ts"], ledger), ["src/app.ts"]);
  assert.equal(isPomeloPath("src\\client\\pomelo\\panel.tsx"), true);
});

test("reports every changed Friday path once in sorted order when the ledger is empty", () => {
  const changedPaths = ["src/app.ts", "README.md", "src\\app.ts", "bin/friday.mjs", "README.md"];

  assert.deepEqual(unlistedPatches(changedPaths, ""), ["README.md", "bin/friday.mjs", "src/app.ts"]);
});
