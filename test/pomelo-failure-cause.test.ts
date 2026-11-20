import assert from "node:assert/strict";
import test from "node:test";
import { failureCause } from "../src/pomelo/failure-cause.js";

function assertCause(
  run: Parameters<typeof failureCause>[0],
  cause: "machine" | "ticket" | "unknown",
  kind: string,
): void {
  const result = failureCause(run);
  assert.equal(result.cause, cause);
  assert.equal(result.kind, kind);
  assert.equal(result.countsAsAttempt, cause !== "machine");
  assert.match(result.reason, /^[^\r\n]{1,200}$/);
}

test("a killed process does not use an attempt", () => {
  assertCause({ exitCode: null, signal: "SIGKILL", tail: "" }, "machine", "killed");
  assertCause({ exitCode: 137, tail: "" }, "machine", "killed");
  assertCause({ exitCode: 1, tail: "Starting\nKilled\n" }, "machine", "killed");
  assertCause({ exitCode: 1, tail: "bash: line 1: 123 Killed  npm test" }, "machine", "killed");
});

test("running out of memory does not use an attempt", () => {
  for (const tail of [
    "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory",
    "spawn failed with ENOMEM",
  ]) {
    assertCause({ exitCode: 1, tail }, "machine", "out-of-memory");
  }
});

test("a full disk does not use an attempt", () => {
  for (const tail of ["npm error code ENOSPC", "write failed: No space left on device"]) {
    assertCause({ exitCode: 1, tail }, "machine", "disk-full");
  }
});

test("a busy port does not use an attempt", () => {
  assertCause({ exitCode: 1, tail: "Error: listen EADDRINUSE: address already in use" }, "machine", "port-busy");
});

test("DNS failures and a reset during an install do not use an attempt", () => {
  assertCause({ exitCode: 1, tail: "getaddrinfo ENOTFOUND registry.example.test" }, "machine", "no-network");
  assertCause({ exitCode: 1, tail: "getaddrinfo EAI_AGAIN registry.example.test" }, "machine", "no-network");
  assertCause({
    exitCode: 1,
    tail: "$ npm ci\nError: read ECONNRESET",
  }, "machine", "no-network");
  assertCause({
    exitCode: 1,
    tail: "npm error code ECONNRESET\nnpm error network request failed",
  }, "machine", "no-network");
});

test("a timed-out process does not use an attempt", () => {
  assertCause({ exitCode: null, signal: "SIGKILL", timedOut: true, tail: "" }, "machine", "timed-out");
  assertCause({ exitCode: 124, tail: "" }, "machine", "timed-out");
  assertCause({ exitCode: null, signal: "SIGTERM", tail: "" }, "machine", "timed-out");
});

test("running out of file descriptors does not use an attempt", () => {
  assertCause({ exitCode: 1, tail: "Error: EMFILE: too many open files" }, "machine", "too-many-files");
});

test("a failing node:test summary uses an attempt", () => {
  for (const tail of ["# tests 3\n# pass 2\n# fail 1\n", "\x1b[31mℹ fail 2\x1b[39m\r\n"]) {
    assertCause({ exitCode: 1, tail }, "ticket", "test-failed");
  }
});

test("a TypeScript error uses an attempt", () => {
  assertCause({
    exitCode: 2,
    tail: "src/example.ts(1,7): error TS2322: Type 'number' is not assignable to type 'string'.",
  }, "ticket", "type-error");
});

test("a missing test file uses an attempt", () => {
  assertCause({ exitCode: 1, tail: "Could not find 'test/example.test.ts'" }, "ticket", "missing-file");
});

test("a failing summary wins even when the process was killed or ran out of disk space", () => {
  assertCause({ exitCode: 137, tail: "# fail 1\nENOSPC\n# fail 0" }, "ticket", "test-failed");
});

test("a machine failure takes precedence over a type error when no summary failed", () => {
  assertCause({ exitCode: 1, tail: "# fail 0\nerror TS2322\nENOSPC" }, "machine", "disk-full");
});

test("an unknown failure still uses an attempt", () => {
  for (const tail of ["", "# fail 0\nCommand failed", "not ok 1 - Killed process is reported", "read ECONNRESET"]) {
    assertCause({ exitCode: 1, tail }, "unknown", "unknown");
  }
});

test("a zero exit code returns a plain error result without using an attempt", () => {
  const result = failureCause({ exitCode: 0, tail: "# fail 1\nENOSPC" });
  assert.equal(result.cause, "unknown");
  assert.equal(result.kind, "invalid-run");
  assert.equal(result.countsAsAttempt, false);
  assert.match(result.reason, /exit code 0/i);
});

test("reasons never include a token-shaped line or its value", () => {
  const token = "fixture".repeat(10);
  const tokenLine = `Authorization: Bearer ${token}`;
  for (const tail of [tokenLine, `npm error code ENOSPC ${tokenLine}`]) {
    const { reason } = failureCause({ exitCode: 1, tail });
    assert.match(reason, /^[^\r\n]{1,200}$/);
    assert.ok(!reason.includes(tokenLine));
    assert.ok(!reason.includes(token));
  }
});
