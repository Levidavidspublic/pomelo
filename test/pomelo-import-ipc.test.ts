import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_IMPORT_COOKIES, checkImportMessage } from "../src/pomelo/import-ipc.js";

const token = ["fake", "pairing", "fixture"].join("-");
const wrongToken = `x${token.slice(1)}`;
const longerToken = `${token}-longer`;
const canary = "cookie-value-canary";
const cookie = { domain: "example.com", name: "fixture", value: canary, path: "/", secure: true };
const message = { token, cookies: [cookie] };
const options = { remoteAddress: "127.0.0.1", expectedToken: token, sites: ["example.com"] };

function assertStatusOnly(status: unknown): void {
  const serialized = JSON.stringify(status);
  for (const fixture of [canary, token, wrongToken, longerToken]) {
    assert.equal(serialized.includes(fixture), false);
  }
}

test("accepts the three supported loopback addresses", () => {
  for (const remoteAddress of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    assert.deepEqual(checkImportMessage(message, { ...options, remoteAddress }), {
      ok: true, cookies: [cookie], skipped: 0,
    });
  }
});

test("refuses other remote addresses with a status-only result", () => {
  for (const remoteAddress of ["10.0.0.5", "100.64.0.5", "127.0.0.2", "localhost", undefined]) {
    const result = checkImportMessage(message, { ...options, remoteAddress });
    assert.deepEqual(result, { ok: false, reason: "not-loopback", received: 0, accepted: 0 });
    assertStatusOnly(result);
  }
});

test("refuses wrong tokens, different lengths, and missing pairing credentials", () => {
  const cases = [
    { given: wrongToken, expectedToken: token, reason: "wrong-token" },
    { given: longerToken, expectedToken: token, reason: "token-length" },
    { given: undefined, expectedToken: token, reason: "wrong-token" },
    { given: "", expectedToken: "", reason: "wrong-token" },
    { given: `${token}\ud800`, expectedToken: `${token}\ud801`, reason: "wrong-token" },
  ];
  for (const { given, expectedToken, reason } of cases) {
    const result = checkImportMessage({ ...message, token: given }, { ...options, expectedToken });
    assert.deepEqual(result, { ok: false, reason, received: 0, accepted: 0 });
    assertStatusOnly(result);
  }
});

test("refuses malformed messages and malformed cookie entries", () => {
  const cases = [
    { input: [message], reason: "invalid-message", received: 0 },
    { input: { token, value: canary }, reason: "invalid-cookies", received: 0 },
    { input: { ...message, cookies: cookie }, reason: "invalid-cookies", received: 0 },
    { input: { token, cookies: [cookie, null] }, reason: "invalid-cookie", received: 2 },
    { input: { token, cookies: [{ ...cookie, value: { canary } }] }, reason: "invalid-cookie", received: 1 },
    { input: { token, cookies: [{ ...cookie, domain: `https://${cookie.domain}/${canary}` }] }, reason: "invalid-cookie", received: 1 },
    { input: { token, cookies: [{ ...cookie, domain: `..${cookie.domain}` }] }, reason: "invalid-cookie", received: 1 },
  ];
  for (const { input, reason, received } of cases) {
    const result = checkImportMessage(input, options);
    assert.deepEqual(result, { ok: false, reason, received, accepted: 0 });
    assertStatusOnly(result);
  }
});

test("accepts the batch limit and refuses a larger batch with counts only", () => {
  const cookies = Array.from({ length: MAX_IMPORT_COOKIES }, () => cookie);
  const atLimit = checkImportMessage({ token, cookies }, options);
  assert.equal(atLimit.ok, true);
  if (atLimit.ok) assert.equal(atLimit.cookies.length, MAX_IMPORT_COOKIES);

  const oversized = checkImportMessage({ token, cookies: [...cookies, cookie] }, options);
  assert.deepEqual(oversized, {
    ok: false, reason: "too-many-cookies", received: MAX_IMPORT_COOKIES + 1, accepted: 0,
  });
  assertStatusOnly(oversized);
});

test("accepts chosen sites and their subdomains and only counts skipped cookies", () => {
  const accepted = [cookie, { ...cookie, domain: ".example.com" }, { ...cookie, domain: "app.example.com" }];
  const skipped = [
    { ...cookie, domain: "evil-example.com" },
    { ...cookie, domain: "example.com.evil.test" },
  ];
  const result = checkImportMessage({ token, cookies: [...accepted, ...skipped] }, options);
  assert.deepEqual(result, { ok: true, cookies: accepted, skipped: 2 });
  assert.ok(result.ok);
  assertStatusOnly(result.skipped);
});

test("uses hostname case folding and never widens a chosen subdomain to its parent", () => {
  const subdomainCookie = { ...cookie, domain: ".shop.app.example.com", value: "" };
  const result = checkImportMessage({ token, cookies: [cookie, subdomainCookie] }, {
    ...options, sites: ["APP.EXAMPLE.COM."],
  });
  assert.deepEqual(result, { ok: true, cookies: [subdomainCookie], skipped: 1 });
  assertStatusOnly(result.skipped);
});

test("an empty site selection skips every cookie", () => {
  const result = checkImportMessage(message, { ...options, sites: [] });
  assert.deepEqual(result, { ok: true, cookies: [], skipped: 1 });
  assertStatusOnly(result);
});
