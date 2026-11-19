import assert from "node:assert/strict";
import test from "node:test";
import { shellGuard } from "../src/pomelo/shell-guard.js";

const serverPath = "src/pomelo/worker.ts";
const clientPath = "src/client/pomelo/browser/worker.ts";
const childProcess = "child_" + "process";
const evalCall = "ev" + "al";
const functionConstructor = "new " + "Function";
const vmRun = "vm." + "runIn";
const processBinding = "process." + "binding";

test("reports module imports and requires with and without the node prefix", () => {
  const added = [
    { line: 3, text: `import { execFile as run, type ChildProcess } from "node:${childProcess}";` },
    { line: 7, text: `import runner from '${childProcess}';` },
    { line: 12, text: `import "${childProcess}";` },
    { line: 15, text: `} from "node:${childProcess}";` },
    { line: 19, text: `const runner = await import("node:${childProcess}");` },
    { line: 25, text: `const { spawn } = require ( 'node:${childProcess}' );` },
    { line: 30, text: `const runner = require("${childProcess}");` },
  ];

  assert.deepEqual(shellGuard([{ path: serverPath, added }]), added.map(({ line }) => ({
    path: serverPath,
    line,
    rule: "child-process",
  })));
});

test("reports code execution and binding by path, line, and rule only", () => {
  assert.deepEqual(shellGuard([{
    path: serverPath,
    added: [
      { line: 4, text: `${evalCall}(source);` },
      { line: 9, text: `const binding = ${processBinding};` },
    ],
  }, {
    path: clientPath,
    added: [
      { line: 13, text: `const run = ${functionConstructor} (source);` },
      { line: 18, text: `${vmRun}NewContext(source);` },
      { line: 24, text: `${vmRun}ThisContext(source);` },
    ],
  }]), [
    { path: serverPath, line: 4, rule: "eval" },
    { path: serverPath, line: 9, rule: "process-binding" },
    { path: clientPath, line: 13, rule: "new-function" },
    { path: clientPath, line: 18, rule: "vm-run-in" },
    { path: clientPath, line: 24, rule: "vm-run-in" },
  ]);
});

test("ignores longer identifiers and unrelated module names", () => {
  assert.deepEqual(shellGuard([{
    path: serverPath,
    added: [
      { line: 1, text: "retrieval(source);" },
      { line: 2, text: "medieval(source);" },
      { line: 3, text: `${functionConstructor}Call(source);` },
      { line: 4, text: `sub${processBinding}(name);` },
      { line: 5, text: `${processBinding}Name;` },
      { line: 6, text: `import runner from "other-${childProcess}";` },
      { line: 7, text: `const name = "${childProcess}";` },
    ],
  }]), []);
});

test("ignores Friday, test, and allow-listed files", () => {
  const allowedPath = "src/pomelo/op-runner.ts";
  const nearbyPath = "src/pomelo/op-runner-helper.ts";
  const added = [{ line: 5, text: `import { execFile } from "node:${childProcess}";` }];

  assert.deepEqual(shellGuard([
    { path: "src/runner/worker.ts", added },
    { path: "test/worker.test.ts", added },
    { path: "src/pomelo-extra/worker.ts", added },
    { path: allowedPath, added },
    { path: nearbyPath, added },
  ], [allowedPath]), [{ path: nearbyPath, line: 5, rule: "child-process" }]);
});

test("reports each matching rule once per line", () => {
  assert.deepEqual(shellGuard([{
    path: serverPath,
    added: [{ line: 8, text: `${evalCall}(a); ${evalCall}(b); ${functionConstructor}(c);` }],
  }]), [
    { path: serverPath, line: 8, rule: "eval" },
    { path: serverPath, line: 8, rule: "new-function" },
  ]);
});

test("returns no findings for an empty file list", () => {
  assert.deepEqual(shellGuard([]), []);
});
