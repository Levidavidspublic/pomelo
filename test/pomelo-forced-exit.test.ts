import assert from "node:assert/strict";
import test from "node:test";
import { forcedExit } from "../src/pomelo/forced-exit.js";

const serverPath = "src/pomelo/worker.ts";
const clientPath = "src/client/pomelo/panel.tsx";
const testPath = "test/pomelo-worker.test.ts";

function changed(path: string, lines: readonly string[], firstLine = 1) {
  return { path, added: lines.map((text, index) => ({ line: firstLine + index, text })) };
}

test("reports exit calls regardless of the status, aborts, and signals to the current process", () => {
  const file = changed(serverPath, [
    "process.exit()",
    "process.exit(0)",
    "process.exit(1)",
    "process.reallyExit(0)",
    "process.abort()",
    "process.kill(process.pid)",
    "process.kill(process.pid, 'SIGTERM')",
  ], 14);

  assert.deepEqual(forcedExit([file]), [
    { path: serverPath, line: 14, rule: "process-exit" },
    { path: serverPath, line: 15, rule: "process-exit" },
    { path: serverPath, line: 16, rule: "process-exit" },
    { path: serverPath, line: 17, rule: "process-exit" },
    { path: serverPath, line: 18, rule: "process-abort" },
    { path: serverPath, line: 19, rule: "process-kill-self" },
    { path: serverPath, line: 20, rule: "process-kill-self" },
  ]);
});

test("reports writes to the exit code through dot and bracket notation", () => {
  const file = changed(clientPath, [
    "process.exitCode = 0",
    "process.exitCode ??= 0",
    'process["exitCode"] = 0',
    "process.exitCode += 1",
    "++process.exitCode;",
    "process.exitCode--;",
  ]);

  assert.deepEqual(forcedExit([file]), file.added.map(({ line }) => ({
    path: clientPath,
    line,
    rule: "exit-code-set",
  })));
});

test("reports process-level error listener registration and removal of all listeners", () => {
  const file = changed(testPath, [
    'process.on("uncaughtException", handler)',
    "process.once('unhandledRejection', handler)",
    'process.addListener("uncaughtException", handler)',
    'process.addListener("unhandledRejection", handler)',
    'process.prependListener("unhandledRejection", handler)',
    'process.removeAllListeners("uncaughtException")',
    'process.removeAllListeners("unhandledRejection")',
    "process.removeAllListeners()",
  ]);

  assert.deepEqual(forcedExit([file]), file.added.map(({ line }) => ({
    path: testPath,
    line,
    rule: "error-event-takeover",
  })));
});

test("recognizes optional calls, destructured exits, and calls split over added lines", () => {
  const file = changed(testPath, [
    "process?.exit(0)",
    "process.exit?.(0)",
    'process?.["exit"](0)',
    "const { exit } = process",
    "exit(0)",
    "const { exit: stop, pid } = process;",
    "stop(1)",
    "process.once(",
    '  "unhandledRejection", handler',
    ")",
  ], 30);

  assert.deepEqual(forcedExit([file]), [
    { path: testPath, line: 30, rule: "process-exit" },
    { path: testPath, line: 31, rule: "process-exit" },
    { path: testPath, line: 32, rule: "process-exit" },
    { path: testPath, line: 34, rule: "process-exit" },
    { path: testPath, line: 36, rule: "process-exit" },
    { path: testPath, line: 37, rule: "error-event-takeover" },
  ]);
});

test("ignores reads, comparisons, other targets, and event names unrelated to errors", () => {
  assert.deepEqual(forcedExit([changed(serverPath, [
    "const code = process.exitCode;",
    'if (process["exitCode"] === 0) finish();',
    "const exitLater = process.exit;",
    "process.exitCode",
    "++count;",
    'process.on("exit", handler);',
    'process.on("SIGINT", handler);',
    'process.removeAllListeners("exit");',
    'process.on("uncaughtException" + suffix, handler);',
    "job.exit();",
    "job.process.exit(0);",
    "myprocess.exit(0);",
    "process.kill(job.pid);",
    "process.kill(process.pid + 1);",
    "const { exit } = job;",
    "exit(0);",
  ])]), []);
});

test("ignores quoted text, template text, and comments while scanning surrounding code", () => {
  const file = changed(testPath, [
    'const sample = "process.exit(0)";',
    'const other = \'process.on("uncaughtException", handler)\';',
    "const message = `process.exitCode = 0",
    "process.abort()`;",
    "const pattern = /process.exit(0)/;",
    "/* process.exit(0)",
    "   process.abort() */ process /* note */ .exit(0);",
    "// process.exit(0)",
    "work(); // process.exitCode = 0",
    "const summary = `process.exit(0) ${",
    "  prepare({ result: `process.abort() ${process.exit(0)}` })",
    "} process.abort()`;",
  ]);

  assert.deepEqual(forcedExit([file]), [
    { path: testPath, line: 7, rule: "process-exit" },
    { path: testPath, line: 11, rule: "process-exit" },
  ]);
});

test("checks only Pomelo paths, skips exact allowed paths, and sorts by path and line", () => {
  const exit = ["process.exit(0)"];
  const files = [
    changed(testPath, exit, 20),
    changed("scripts/test.mjs", exit),
    changed("bin/friday.mjs", exit),
    changed("test/app.test.ts", exit),
    changed("test/subdir/pomelo-worker.test.ts", exit),
    changed("test/pomelo-worker.spec.ts", exit),
    changed("src/pomelo-extra/worker.ts", exit),
    changed("src/client/pomelo-extra/worker.ts", exit),
    changed(serverPath, exit),
    changed(clientPath, exit),
    { path: testPath, added: [
      { line: 12, text: "process.exit(); process.exit(0); process.abort();" },
      { line: 2, text: exit[0] },
    ] },
  ];

  assert.deepEqual(forcedExit(files, [serverPath, "test/pomelo-*.test.ts"]), [
    { path: clientPath, line: 1, rule: "process-exit" },
    { path: testPath, line: 2, rule: "process-exit" },
    { path: testPath, line: 12, rule: "process-exit" },
    { path: testPath, line: 12, rule: "process-abort" },
    { path: testPath, line: 20, rule: "process-exit" },
  ]);
});

test("keeps comments and destructuring local to consecutive added lines", () => {
  const file = {
    path: serverPath,
    added: [
      { line: 2, text: "const { exit } = process" },
      { line: 4, text: "exit(0)" },
      { line: 6, text: "/* missing closing line" },
      { line: 9, text: "process.exit(1)" },
    ],
  };

  assert.deepEqual(forcedExit([file]), [{ path: serverPath, line: 9, rule: "process-exit" }]);
});

test("skips malformed inputs and keeps valid added lines", () => {
  assert.deepEqual(forcedExit(null), []);
  assert.deepEqual(forcedExit({ path: serverPath, added: [] }), []);
  assert.deepEqual(forcedExit([
    null,
    { path: 5, added: [] },
    { path: serverPath, added: "process.exit(0)" },
    { path: testPath, added: [
      null,
      { line: "5", text: "process.exit(0)" },
      { line: -1, text: "process.exit(0)" },
      { line: 6, text: {} },
      { line: 7, text: "process.exit(0)" },
    ] },
  ], {}), [{ path: testPath, line: 7, rule: "process-exit" }]);
});
