import assert from "node:assert/strict";
import test from "node:test";
import { navigationCheck } from "../src/pomelo/browser/nav-rule.js";

test("public HTTP and HTTPS addresses and about:blank may open", () => {
  for (const address of [
    "https://a.example/docs",
    "http://a.example",
    "http://8.8.8.8",
    "http://172.15.0.1",
    "http://172.32.0.1",
    "http://[2001:4860::1]/",
    "http://[::ffff:8.8.8.8]/",
    "http://nas.local.example",
    "http://localhost.example",
  ]) {
    const result = navigationCheck(address);
    assert.equal(result.verdict, "go", address);
    assert.equal(result.origin, new URL(address).origin);
  }
  const blank = navigationCheck("about:blank");
  assert.equal(blank.verdict, "go");
  assert.equal(blank.origin, null);
});

test("unsupported schemes and malformed addresses are refused", () => {
  for (const address of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,x",
    "blob:https://a.example/placeholder",
    "chrome://settings",
    "about:settings",
    "about:blank?example",
    "view-source:https://a.example",
    "not an address",
    "https://[::1",
  ]) {
    const result = navigationCheck(address, { allowPrivate: true });
    assert.equal(result.verdict, "refuse", address);
    assert.equal(result.origin, null);
  }
});

test("a username or password always causes refusal", () => {
  for (const address of ["https://user:pass@a.example", "https://user@a.example", "https://:placeholder@a.example"]) {
    const result = navigationCheck(address, { allowPrivate: true, allowedHosts: ["a.example"] });
    assert.equal(result.verdict, "refuse");
    assert.equal(result.origin, "https://a.example");
  }
});

test("private addresses require approval after URL normalization", () => {
  for (const address of [
    "http://127.0.0.1:3000",
    "http://127.1",
    "http://0x7f000001",
    "http://0.0.0.0",
    "http://10.0.0.5",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.1",
    "http://100.64.0.1",
    "http://169.254.169.254/",
    "http://[::1]/",
    "http://[::]/",
    "http://[fc00::1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[febf::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[0:0:0:0:0:ffff:c0a8:1]/",
    "http://[::ffff:0.0.0.0]/",
    "http://nas.local",
    "http://Printer.Internal./",
    "http://localhost",
    "http://service.localhost./",
  ]) {
    const result = navigationCheck(address);
    assert.equal(result.verdict, "ask", address);
    assert.equal(result.origin, new URL(address).origin);
  }
});

test("private navigation may be approved globally or for an exact hostname", () => {
  const address = "http://nas.local:3000";
  assert.equal(navigationCheck(address, { allowPrivate: true }).verdict, "go");
  assert.equal(navigationCheck(address, { allowedHosts: ["NAS.LOCAL."] }).verdict, "go");
  assert.equal(navigationCheck(address, { allowedHosts: ["local", "*.local", "nas.local:3000"] }).verdict, "ask");
  assert.equal(navigationCheck("http://[::1]:3000", { allowedHosts: ["[::1]"] }).verdict, "go");
});

test("results keep paths, queries and fragments out of status text", () => {
  const canary = "navigation-test-canary";
  for (const [address, verdict, origin] of [
    [`https://a.example:8443/${canary}?q=${canary}#${canary}`, "go", "https://a.example:8443"],
    [`http://nas.local/${canary}?q=${canary}#${canary}`, "ask", "http://nas.local"],
    [`https://${canary}@a.example/${canary}?q=${canary}`, "refuse", "https://a.example"],
    [`https://[invalid]/${canary}?q=${canary}`, "refuse", null],
    [`file:///${canary}?q=${canary}`, "refuse", null],
  ] as const) {
    const result = navigationCheck(address);
    assert.equal(result.verdict, verdict);
    assert.equal(result.origin, origin);
    assert.match(result.reason, /^[A-Z][^\n]+\.$/);
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
});
