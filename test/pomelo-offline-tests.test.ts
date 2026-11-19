import assert from "node:assert/strict";
import test from "node:test";
import { offlineTestFindings } from "../src/pomelo/offline-tests.js";

const testFile = "test/pomelo-example.test.ts";
const remoteHttp = ["https://", "example.invalid/resource"].join("");
const remoteSocket = ["wss://", "example.invalid/socket"].join("");

test("reports an added line in a Pomelo test once even with multiple remote addresses", () => {
  assert.deepEqual(offlineTestFindings([{
    path: testFile,
    added: [
      { line: 4, text: 'const local = "http://localhost:3000";' },
      { line: 12, text: `["${remoteHttp}", "${remoteSocket}"]` },
    ],
  }]), [{ file: testFile, line: 12, reason: "Remote URL" }]);
});

test("allows the loopback hosts with and without ports", () => {
  const urls = [
    "http://127.0.0.1:1/",
    "https://LOCALHOST:65535/resource",
    "ws://[::1]:4321/socket",
    "wss://localhost/socket",
  ];
  assert.deepEqual(offlineTestFindings([{
    path: testFile,
    added: urls.map((url, index) => ({ line: index + 1, text: `"${url}"` })),
  }]), []);
});

test("reports remote WebSocket addresses in Pomelo server and client code", () => {
  const server = "src/pomelo/browser/socket.ts";
  const client = "src/client/pomelo/socket.ts";
  const ws = ["ws://", "example.invalid/socket"].join("");
  assert.deepEqual(offlineTestFindings([
    { path: server, added: [{ line: 7, text: `new WebSocket("${ws}");` }] },
    { path: client, added: [{ line: 19, text: `new WebSocket("${remoteSocket}");` }] },
  ]), [
    { file: server, line: 7, reason: "Remote URL" },
    { file: client, line: 19, reason: "Remote URL" },
  ]);
});

test("reports package install commands in shell strings", () => {
  const commands = ["npx", ["npm", "install"].join(" "), ["pnpm", "add"].join(" "), ["yarn", "add"].join(" ")];
  const added = commands.map((command, index) => ({ line: index + 2, text: `exec("${command} fixture-cli");` }));
  assert.deepEqual(offlineTestFindings([{ path: testFile, added }]), added.map(({ line }) => ({
    file: testFile, line, reason: "Package install command",
  })));
});

test("ignores the same lines outside Pomelo paths", () => {
  const added = [
    { line: 3, text: `fetch("${remoteHttp}");` },
    { line: 4, text: `new WebSocket("${remoteSocket}");` },
    { line: 5, text: `exec("${["npm", "install", "fixture-cli"].join(" ")}");` },
  ];
  const paths = ["test/example.test.ts", "test/helpers/pomelo-example.test.ts", "src/pomelo-extra/example.ts", "src/client/example.ts"];
  assert.deepEqual(offlineTestFindings(paths.map((path) => ({ path, added }))), []);
});

test("reports a remote host without exposing the address or query value", () => {
  const queryValue = "fixture-query-value";
  const url = ["http://", "localhost@localhost.example.invalid/resource?token=", queryValue].join("");
  const findings = offlineTestFindings([{
    path: testFile,
    added: [{ line: 26, text: `["http://localhost:3000", "${url}"]` }],
  }]);

  assert.deepEqual(findings, [{ file: testFile, line: 26, reason: "Remote URL" }]);
  const serialized = JSON.stringify(findings);
  assert.ok(!serialized.includes(url));
  assert.ok(!serialized.includes(queryValue));
});

test("ignores malformed addresses and command lookalikes", () => {
  assert.deepEqual(offlineTestFindings([{
    path: testFile,
    added: [
      { line: 2, text: 'const address = "http://[";' },
      { line: 6, text: `exec("${["npm", "install-helper"].join(" ")}");` },
      { line: 7, text: 'exec("npx-helper fixture-cli");' },
      { line: 8, text: 'exec("npm test");' },
    ],
  }]), []);
});

test("returns no findings for empty input", () => {
  assert.deepEqual(offlineTestFindings([]), []);
});
