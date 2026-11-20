import assert from "node:assert/strict";
import test from "node:test";
import { logGuard } from "../src/pomelo/log-guard.js";

const serverPath = "src/pomelo/worker.ts";
const clientPath = "src/client/pomelo/panel.tsx";
const consoleObject = "con" + "sole";
const consoleLog = consoleObject + ".log";
const stdoutWrite = "process." + "stdout.write";
const stderrWrite = "process." + "stderr.write";
const debuggerWord = "debug" + "ger";

test("reports each console method with its added line number and no source text", () => {
  const methods = ["log", "info", "debug", "warn", "error", "dir", "table", "trace"];
  const rules = methods.map((method) => `${consoleObject}.${method}`);

  assert.deepEqual(logGuard([{
    path: serverPath,
    added: rules.map((rule, index) => ({ line: 10 + index, text: `  ${rule}("sample");` })),
  }]), rules.map((rule, index) => ({ path: serverPath, line: 10 + index, rule })));
});

test("reports both process streams and a debugger statement in client code", () => {
  assert.deepEqual(logGuard([{
    path: clientPath,
    added: [
      { line: 4, text: `${stdoutWrite}("sample");` },
      { line: 6, text: `${stderrWrite}("sample");` },
      { line: 9, text: `  ${debuggerWord};` },
      { line: 12, text: `if (ready) { ${debuggerWord} }` },
      { line: 14, text: `  ${debuggerWord}` },
    ],
  }]), [
    { path: clientPath, line: 4, rule: stdoutWrite },
    { path: clientPath, line: 6, rule: stderrWrite },
    { path: clientPath, line: 9, rule: debuggerWord },
    { path: clientPath, line: 12, rule: debuggerWord },
    { path: clientPath, line: 14, rule: debuggerWord },
  ]);
});

test("ignores comments, quoted text, lookalike identifiers, and bare references", () => {
  assert.deepEqual(logGuard([{
    path: serverPath,
    added: [
      { line: 2, text: `  // ${consoleLog}(); ${debuggerWord};` },
      { line: 3, text: `/* ${stdoutWrite}(); */` },
      { line: 4, text: "/* Notes" },
      { line: 5, text: ` * ${consoleLog}();` },
      { line: 6, text: ` ${debuggerWord}; */` },
      { line: 8, text: `const example = "${debuggerWord}; ${consoleLog}()";` },
      { line: 9, text: `const example = '${stderrWrite}()';` },
      { line: 10, text: `const example = \`${debuggerWord};\`;` },
      { line: 11, text: `const ${debuggerWord}Port = 0;` },
      { line: 12, text: `settings.${debuggerWord};` },
      { line: 13, text: `my${consoleLog}();` },
      { line: 14, text: `$${consoleLog}();` },
      { line: 15, text: `const print = ${consoleLog};` },
      { line: 16, text: `ready(); // ${consoleLog}();` },
    ],
  }]), []);
});

test("reports each distinct rule once per line alongside comments and quoted text", () => {
  assert.deepEqual(logGuard([{
    path: serverPath,
    added: [
      {
        line: 23,
        text: `/* note */ ${consoleObject} . log ("//"); ${consoleLog}(); ${stderrWrite}(); // ${stdoutWrite}();`,
      },
      { line: 24, text: "/* note" },
      { line: 25, text: ` */ ${consoleObject}?.warn?.();` },
      { line: 27, text: "/* note" },
      { line: 30, text: `${stdoutWrite}();` },
    ],
  }]), [
    { path: serverPath, line: 23, rule: consoleLog },
    { path: serverPath, line: 23, rule: stderrWrite },
    { path: serverPath, line: 25, rule: `${consoleObject}.warn` },
    { path: serverPath, line: 30, rule: stdoutWrite },
  ]);
});

test("checks only Pomelo paths and skips exact allow-listed paths", () => {
  const added = [{ line: 7, text: `${consoleLog}();` }];
  assert.deepEqual(logGuard([
    { path: "src/app.ts", added },
    { path: "src/client/pomelo-extra/panel.tsx", added },
    { path: "src/pomelo-extra/worker.ts", added },
    { path: serverPath, added },
    { path: `${serverPath}x`, added },
    { path: clientPath, added },
  ], [serverPath]), [
    { path: `${serverPath}x`, line: 7, rule: consoleLog },
    { path: clientPath, line: 7, rule: consoleLog },
  ]);
});
