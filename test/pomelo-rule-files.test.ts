import assert from "node:assert/strict";
import test from "node:test";
import { RULE_FILE_PATHS, ruleFileChanges } from "../src/pomelo/rule-files.js";

test("allows changes outside the kitchen rule paths", () => {
  const diff = [
    "M\tsrc/pomelo/x.ts",
    "M\tdocs/harness-notes.md",
    "M\tsrc/docs/harness/x.ts",
    "M\tsrc/AGENTS.md",
  ].join("\n");

  assert.deepEqual(ruleFileChanges(diff), []);
});

test("reports modified, deleted and added rule files with a review reason", () => {
  const diff = ["M\tdocs/harness/06-ROADMAP.md", "D\tAGENTS.md", "A\t.coderabbit.yaml"].join("\n");
  const findings = ruleFileChanges(diff);

  assert.deepEqual(findings.map(({ path, kind }) => ({ path, kind })), [
    { path: "docs/harness/06-ROADMAP.md", kind: "changed" },
    { path: "AGENTS.md", kind: "deleted" },
    { path: ".coderabbit.yaml", kind: "added" },
  ]);
  for (const { reason } of findings) assert.match(reason, /kitchen rules.*Amit/i);
});

test("checks both paths of each rename independently", () => {
  const diff = [
    "R100\tPOMELO.md\tdocs/old.md",
    "R090\tnotes.md\tfactory/SLOTS.md",
    "R100\tCLAUDE.md\tCONTRIBUTING.md",
  ].join("\n");

  assert.deepEqual(ruleFileChanges(diff).map(({ path, kind }) => ({ path, kind })), [
    { path: "POMELO.md", kind: "renamed-from" },
    { path: "factory/SLOTS.md", kind: "renamed-to" },
    { path: "CLAUDE.md", kind: "renamed-from" },
    { path: "CONTRIBUTING.md", kind: "renamed-to" },
  ]);
});

test("reports only the destination of a copy as added", () => {
  const diff = ["C100\tAGENTS.md\tnotes.md", "C090\tPOMELO.md\tCLAUDE.md"].join("\n");

  assert.deepEqual(ruleFileChanges(diff).map(({ path, kind }) => ({ path, kind })), [
    { path: "CLAUDE.md", kind: "added" },
  ]);
});

test("compares paths without regard to case or slash direction and preserves their spelling", () => {
  const paths = ["Docs/Harness/01-PRD.md", "factory\\slots.md", "DOCS\\HARNESS\\nested\\rules.md"];
  const diff = paths.map((path) => `M\t${path}`).join("\r\n");

  assert.deepEqual(ruleFileChanges(diff).map(({ path }) => path), paths);
});

test("reads Git-quoted paths and reports type changes and scored modifications", () => {
  const diff = [
    `T\t${String.raw`"docs/harness/caf\303\251\trules.md"`}`,
    `M100\t${String.raw`"factory\\SLOTS.md"`}`,
  ].join("\n");

  assert.deepEqual(ruleFileChanges(diff).map(({ path, kind }) => ({ path, kind })), [
    { path: "docs/harness/café\trules.md", kind: "changed" },
    { path: "factory\\SLOTS.md", kind: "changed" },
  ]);
});

test("skips blank and malformed rows and keeps checking later rows", () => {
  const diff = [
    "",
    "   ",
    "M AGENTS.md",
    "A\tAGENTS.md\textra",
    'D\t"AGENTS.md',
    "R100\tPOMELO.md",
    "R101\tnotes.md\tAGENTS.md",
    "C090\t\tAGENTS.md",
    "A\tCLAUDE.md",
  ].join("\n");

  assert.deepEqual(ruleFileChanges(diff).map(({ path }) => path), ["CLAUDE.md"]);
});

test("returns no findings for empty text or values other than strings", () => {
  for (const input of ["", null, undefined, 42, ["M\tAGENTS.md"]]) {
    assert.deepEqual(ruleFileChanges(input as unknown as string), []);
  }
});

test("exports the frozen list of kitchen rule paths", () => {
  assert.ok(Object.isFrozen(RULE_FILE_PATHS));
  assert.deepEqual(new Set(RULE_FILE_PATHS), new Set([
    "docs/harness/",
    "AGENTS.md",
    "CLAUDE.md",
    "POMELO.md",
    ".coderabbit.yaml",
    "factory/SLOTS.md",
    "CONTRIBUTING.md",
  ]));
});
