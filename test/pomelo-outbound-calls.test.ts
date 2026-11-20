import assert from "node:assert/strict";
import test from "node:test";
import { outboundCalls } from "../src/pomelo/outbound-calls.js";

const path = "src/pomelo/browser/connection.ts";
const clientPath = "src/client/pomelo/connection.ts";
const remoteUrl = ["https://", "example.invalid/resource"].join("");

function fetchLine(address: string): string {
  return `await ${"fetch"}(${JSON.stringify(address)});`;
}

test("reports each network rule on its own added line", () => {
  const cases = [
    [fetchLine(remoteUrl), "fetch"],
    [`new ${"WebSocket"}(endpoint);`, "WebSocket"],
    [`new ${"EventSource"}(endpoint);`, "EventSource"],
    [`new ${"XMLHttpRequest"}();`, "XMLHttpRequest"],
    [`navigator.${"sendBeacon"}(endpoint, body);`, "navigator.sendBeacon"],
    [`import client from ${JSON.stringify(["node:", "http"].join(""))};`, "network-module"],
  ];
  const added = cases.map(([text], index) => ({ line: 10 + index * 2, text }));

  assert.deepEqual(outboundCalls([{ path, added }]), cases.map(([, rule], index) => ({
    path, line: added[index].line, rule, loopback: false,
  })));
});

test("recognizes the listed module specifiers in imports and requires", () => {
  const builtins = ["http", "https", "net", "tls", "dgram"];
  const modules = [...builtins, ...builtins.map((name) => `node:${name}`), "undici"];
  const added = modules.flatMap((name, index) => [
    { line: index * 2 + 1, text: `import '${name}';` },
    { line: index * 2 + 2, text: `${"require"} ("${name}");` },
  ]);
  added.push({ line: 23, text: `await ${"import"}('${"undici"}');` });

  assert.deepEqual(outboundCalls([{ path, added }]), added.map(({ line }) => ({
    path, line, rule: "network-module", loopback: false,
  })));
});

test("marks lines with only a literal loopback address", () => {
  const addresses = ["http://127.0.0.1:3000/", "https://LOCALHOST/resource", "http://[::1]:3000", "localhost"];
  const added = addresses.map((address, index) => ({ line: index + 1, text: fetchLine(address) }));

  assert.deepEqual(outboundCalls([{ path: clientPath, added }]), added.map(({ line }) => ({
    path: clientPath, line, rule: "fetch", loopback: true,
  })));
});

test("requires a literal loopback host and no other address on the line", () => {
  const remoteHost = "example.invalid";
  const localUrl = "http://localhost:3000";
  const texts = [
    fetchLine(remoteUrl),
    fetchLine(["http://", `localhost.${remoteHost}/`].join("")),
    fetchLine(["http://", `${remoteHost}/localhost`].join("")),
    fetchLine(["http://", `localhost@${remoteHost}`].join("")),
    fetchLine("http://127.1/"),
    fetchLine("/api/resource"),
    `${fetchLine(localUrl)} ${fetchLine(remoteUrl)}`,
    `${fetchLine(localUrl)} ${fetchLine(`//${remoteHost}/resource`)}`,
    `${fetchLine(localUrl)} ${fetchLine(`  //${remoteHost}/resource`)}`,
    `${fetchLine(localUrl)} ${fetchLine(remoteHost)}`,
  ];
  const added = texts.map((text, index) => ({ line: index + 1, text }));

  assert.deepEqual(outboundCalls([{ path, added }]), added.map(({ line }) => ({
    path, line, rule: "fetch", loopback: false,
  })));
});

test("returns one metadata-only finding per matching rule on a line", () => {
  const text = `${fetchLine(remoteUrl)} new ${"WebSocket"}(socket); ${fetchLine(remoteUrl)}`;
  assert.deepEqual(outboundCalls([{ path, added: [{ line: 42, text }] }]), [
    { path, line: 42, rule: "fetch", loopback: false },
    { path, line: 42, rule: "WebSocket", loopback: false },
  ]);
});

test("ignores comment-only lines and longer identifiers", () => {
  const texts = [
    `  // ${fetchLine(remoteUrl)}`,
    `\t* ${fetchLine(remoteUrl)}`,
    `/* ${fetchLine(remoteUrl)} */`,
    "prefetchRows(endpoint);",
    "fetcher(endpoint);",
    "$fetch(endpoint);",
    "éfetch(endpoint);",
    "new WebSocketServer();",
    "new CustomXMLHttpRequest();",
    "myNavigator.sendBeacon(endpoint, body);",
    `import client from '${"undici"}-mock';`,
  ];
  const added = texts.map((text, index) => ({ line: index + 1, text }));

  assert.deepEqual(outboundCalls([{ path, added }]), []);
});

test("keeps code beside a comment and ignores addresses inside the comment", () => {
  const text = `/* local health check */ ${fetchLine("http://localhost")} // new ${"WebSocket"}("${remoteUrl}")`;

  assert.deepEqual(outboundCalls([{ path, added: [{ line: 8, text }] }]), [
    { path, line: 8, rule: "fetch", loopback: true },
  ]);
});

test("ignores quoted examples and still finds calls in template expressions", () => {
  const added = [
    { line: 1, text: `const label = '${"XMLHttpRequest"}';` },
    { line: 2, text: `const example = ${JSON.stringify(fetchLine(remoteUrl))};` },
    { line: 3, text: `const example = '${"require"}("${"https"}")';` },
    { line: 4, text: 'const message = `result: ${' + `${"fetch"}(endpoint)}` + '`;' },
  ];

  assert.deepEqual(outboundCalls([{ path, added }]), [{ path, line: 4, rule: "fetch", loopback: false }]);
});

test("skips allow-listed paths, test files, and files outside the Pomelo folders", () => {
  const added = [{ line: 3, text: fetchLine(remoteUrl) }];
  const paths = [path, clientPath, "src/server/connection.ts", "src/pomelo-extra/connection.ts", "test/pomelo-example.test.ts", "src/pomelo/connection.test.ts"];
  const files = paths.map((path) => ({ path, added }));

  assert.deepEqual(outboundCalls(files, [path]), [{ path: clientPath, line: 3, rule: "fetch", loopback: false }]);
});
