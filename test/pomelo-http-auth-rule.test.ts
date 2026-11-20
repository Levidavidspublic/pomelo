import assert from "node:assert/strict";
import test from "node:test";
import { decideHttpAuth } from "../src/pomelo/browser/http-auth-rule.js";

const origin = "https://login.example.test";
const challenge = { origin, isHttps: true, isProxy: false, realm: "Example sign-in" };
const matchingSites = [{ allowedOrigins: ["https://other.example.test", origin] }];

test("holds for Amit when a saved reference fits the exact origin", () => {
  const result = decideHttpAuth(challenge, matchingSites);
  assert.equal(result.decision, "hold");
  assert.equal(result.origin, origin);
  assert.ok(result.reason.includes(origin));
  assert.match(result.reason, /Amit/);
  assert.deepEqual(Object.keys(result).sort(), ["decision", "origin", "reason"]);
});

test("holds for Amit when more than one saved reference fits", () => {
  const result = decideHttpAuth(challenge, [...matchingSites, { allowedOrigins: [origin] }]);
  assert.equal(result.decision, "hold");
  assert.match(result.reason, /Amit/);
});

test("cancels when no saved reference fits", () => {
  assert.equal(decideHttpAuth(challenge, []).decision, "cancel");
  assert.equal(decideHttpAuth(challenge, [{ allowedOrigins: ["http://login.example.test"] }]).decision, "cancel");
});

test("cancels for look-alike hosts and a different port", () => {
  for (const otherOrigin of [
    "https://extra.login.example.test",
    "https://login.example.test.other.test",
    "https://login.example.invalid",
    `${origin}:8443`,
  ]) {
    const result = decideHttpAuth({ ...challenge, origin: otherOrigin }, matchingSites);
    assert.equal(result.decision, "cancel", otherOrigin);
    assert.equal(result.origin, otherOrigin);
  }
});

test("holds when both origins have the same non-default port", () => {
  const portOrigin = `${origin}:8443`;
  const result = decideHttpAuth({ ...challenge, origin: portOrigin }, [{ allowedOrigins: [portOrigin] }]);
  assert.equal(result.decision, "hold");
  assert.ok(result.reason.includes(portOrigin));
});

test("refuses plain HTTP even with a matching reference and a proxy challenge", () => {
  const httpOrigin = "http://login.example.test";
  for (const isProxy of [false, true]) {
    const result = decideHttpAuth(
      { ...challenge, origin: httpOrigin, isHttps: false, isProxy },
      [{ allowedOrigins: [httpOrigin] }],
    );
    assert.equal(result.decision, "refuse");
    assert.equal(result.origin, httpOrigin);
  }
  assert.equal(decideHttpAuth({ ...challenge, isHttps: false }, matchingSites).decision, "refuse");
  assert.equal(decideHttpAuth({ ...challenge, origin: httpOrigin }, [{ allowedOrigins: [httpOrigin] }]).decision, "refuse");
});

test("holds for Amit on a proxy challenge regardless of saved site references", () => {
  const proxy = { ...challenge, isProxy: true };
  const result = decideHttpAuth(proxy, matchingSites);
  assert.equal(result.decision, "hold");
  assert.match(result.reason, /proxy/i);
  assert.match(result.reason, /Amit/);
  assert.deepEqual(result, decideHttpAuth(proxy, []));
  assert.deepEqual(Object.keys(result).sort(), ["decision", "origin", "reason"]);
});

test("refuses an agent-supplied username or password and points to the broker", () => {
  const canary = "fake-http-auth-typed-canary";
  for (const attempt of [{ username: canary }, { password: canary }, { username: "" }, { password: "" }]) {
    for (const isProxy of [false, true]) {
      const result = decideHttpAuth({ ...challenge, isProxy }, matchingSites, attempt);
      assert.equal(result.decision, "refuse");
      assert.match(result.reason, /1Password broker/);
      assert.equal(JSON.stringify(result).includes(canary), false);
    }
  }
});

test("leaves realm text out of the result even when a canary starts a long realm", () => {
  const canary = "fake-http-auth-realm-canary";
  const padding = "realm text ".repeat(100);
  for (const realm of [canary + padding, padding + canary]) {
    const result = decideHttpAuth({ ...challenge, realm }, matchingSites);
    assert.equal(result.decision, "hold");
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(canary), false);
    assert.ok(serialized.length < realm.length);
    assert.deepEqual(result, decideHttpAuth({ ...challenge, realm: "" }, matchingSites));
  }
});

test("refuses invalid or empty origins without echoing the input", () => {
  const canary = "fake-http-auth-origin-canary";
  for (const badOrigin of [
    "",
    "not an origin",
    "https://",
    "https://*.example.test",
    `blob:${origin}/${canary}`,
    `${origin}/sign-in?test=${canary}`,
    `https://${canary}@login.example.test`,
  ]) {
    const result = decideHttpAuth({ ...challenge, origin: badOrigin }, matchingSites);
    assert.equal(result.decision, "refuse");
    assert.equal(result.origin, null);
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
});
