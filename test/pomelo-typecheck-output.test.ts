import assert from "node:assert/strict";
import test from "node:test";
import { typecheckOutput } from "../src/pomelo/typecheck-output.js";

const plainError = "src/pomelo/x.ts(3,5): error TS2322: Type 'number' is not assignable to type 'string'.";

test("a clean run passes with silent compiler output or the npm script banner", () => {
  for (const output of ["", "\n> friday-work@0.3.4 typecheck\n> tsc --noEmit\n\n"]) {
    assert.deepEqual(typecheckOutput({ exitCode: 0, output }), { ok: true });
  }
});

test("plain diagnostics are counted by file and retain the first code", () => {
  const output = [
    "src/server.ts(7,2): error TS2304: Cannot find name 'value'.",
    plainError,
    "src/pomelo/x.ts(8,1): error TS1005: Expression expected.",
    "Found 3 errors in 2 files.",
  ].join("\n");

  assert.deepEqual(typecheckOutput({ exitCode: 1, output }), {
    ok: false,
    reason: "type-errors",
    pomelo: [{ file: "src/pomelo/x.ts", errors: 2, firstCode: "TS2322" }],
    friday: [{ file: "src/server.ts", errors: 1, firstCode: "TS2304" }],
  });
});

test("pretty diagnostics handle ANSI colours, Windows paths and CRLF", () => {
  const output = [
    "\x1b[96m.\\src\\pomelo\\x.ts\x1b[0m:\x1b[93m3\x1b[0m:\x1b[93m5\x1b[0m - \x1b[91merror\x1b[0m \x1b[90mTS2322: \x1b[0mType mismatch.",
    "\x1b[7m3\x1b[0m const value: string = 42;",
    "src/pomelo/x.ts:8:1 - error TS1005: Expression expected.",
    "\x1b[91mFound 2 errors in the same file, starting at: \x1b[96msrc/pomelo/x.ts\x1b[0m\x1b[90m:3\x1b[0m",
  ].join("\r\n");

  assert.deepEqual(typecheckOutput({ exitCode: 2, output }), {
    ok: false,
    reason: "type-errors",
    pomelo: [{ file: "src/pomelo/x.ts", errors: 2, firstCode: "TS2322" }],
    friday: [],
  });
});

test("file lists are sorted and use all three Pomelo path prefixes", () => {
  const output = [
    "test\\pomelo-example.test.ts:1:1 - error TS2304: Cannot find name 'value'.",
    "test/friday.test.ts(1,1): error TS2304: Cannot find name 'value'.",
    plainError,
    "src/server.ts(1,1): error TS2304: Cannot find name 'value'.",
    "src/client/pomelo/a component.tsx:1:1 - error TS2304: Cannot find name 'value'.",
  ].join("\n");

  assert.deepEqual(typecheckOutput({ exitCode: 2, output }), {
    ok: false,
    reason: "type-errors",
    pomelo: [
      { file: "src/client/pomelo/a component.tsx", errors: 1, firstCode: "TS2304" },
      { file: "src/pomelo/x.ts", errors: 1, firstCode: "TS2322" },
      { file: "test/pomelo-example.test.ts", errors: 1, firstCode: "TS2304" },
    ],
    friday: [
      { file: "src/server.ts", errors: 1, firstCode: "TS2304" },
      { file: "test/friday.test.ts", errors: 1, firstCode: "TS2304" },
    ],
  });
});

test("a failed run without file diagnostics is unreadable", () => {
  for (const output of ["", "Found 3 errors in 2 files.", "error TS18003: No inputs were found."]) {
    assert.deepEqual(typecheckOutput({ exitCode: 1, output }), {
      ok: false, reason: "unreadable", pomelo: [], friday: [],
    });
  }
});

test("unreadable or cut-off text cannot pass with a zero exit code", () => {
  for (const output of ["Found 3 errors in 2 files.", "src/pomelo/x.ts(3,5): error TS23", "> friday-work@0.3.4 typecheck"]) {
    assert.deepEqual(typecheckOutput({ exitCode: 0, output }), {
      ok: false, reason: "unreadable", pomelo: [], friday: [],
    });
  }
});

test("diagnostics contradict a zero exit code even without a summary", () => {
  assert.deepEqual(typecheckOutput({ exitCode: 0, output: plainError }), {
    ok: false,
    reason: "exit-code-mismatch",
    pomelo: [{ file: "src/pomelo/x.ts", errors: 1, firstCode: "TS2322" }],
    friday: [],
  });
  assert.deepEqual(typecheckOutput({ exitCode: 0, output: "error TS18003: No inputs were found." }), {
    ok: false, reason: "exit-code-mismatch", pomelo: [], friday: [],
  });
});

test("shell and npm launch failures are not-run regardless of exit code", () => {
  for (const output of ["tsc: not found", "sh: 1: tsc: not found", 'npm error Missing script: "typecheck"', 'npm ERR! Missing script: "typecheck"']) {
    for (const exitCode of [0, 1]) {
      assert.deepEqual(typecheckOutput({ exitCode, output }), {
        ok: false, reason: "not-run", pomelo: [], friday: [],
      });
    }
  }
});

test("missing input, non-string output and invalid exit codes are unreadable", () => {
  for (const input of [undefined, null, { exitCode: 0, output: {} }, { exitCode: 0, output: null }, { output: "" }, { exitCode: "0", output: "" }]) {
    assert.deepEqual(typecheckOutput(input), {
      ok: false, reason: "unreadable", pomelo: [], friday: [],
    });
  }
});
