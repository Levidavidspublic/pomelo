import assert from "node:assert/strict";
import test from "node:test";
import { mapChromeCookies } from "../src/pomelo/cookie-map.js";

const canary = "pomelo-fake-cookie-canary";
const now = 1_800_000_000;
const cookie = {
  name: "sample",
  value: canary,
  domain: ".example.com",
  path: "/account",
  expirationDate: now + 60,
  httpOnly: true,
  secure: true,
  sameSite: "no_restriction",
};

test("maps Chrome cookie fields and converts SameSite values", () => {
  const { cookies, report } = mapChromeCookies([
    cookie,
    { ...cookie, sameSite: "lax" },
    { ...cookie, sameSite: "strict" },
    { ...cookie, sameSite: "unspecified" },
  ], { sites: ["example.com"], now });
  const expected = {
    name: "sample",
    value: canary,
    domain: ".example.com",
    path: "/account",
    expires: now + 60,
    httpOnly: true,
    secure: true,
  };

  assert.deepEqual(cookies, [
    { ...expected, sameSite: "None" },
    { ...expected, sameSite: "Lax" },
    { ...expected, sameSite: "Strict" },
    expected,
  ]);
  assert.deepEqual(report, [
    { site: "example.com", result: "imported", counts: { imported: 4, expired: 0, incompatible: 0 } },
  ]);
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test("leaves expiration out of session cookies and counts expired cookies by site", () => {
  const { cookies, report } = mapChromeCookies([
    { ...cookie, expirationDate: undefined },
    { ...cookie, session: true, expirationDate: now - 1 },
    { ...cookie, expirationDate: now - 1 },
    { ...cookie, domain: ".example.net", expirationDate: now - 1 },
  ], { sites: ["example.com", "example.net"], now });

  assert.equal(cookies.length, 2);
  assert.ok(cookies.every((entry) => !Object.hasOwn(entry, "expires")));
  assert.deepEqual(report, [
    { site: "example.com", result: "imported", counts: { imported: 2, expired: 1, incompatible: 0 } },
    { site: "example.net", result: "expired", counts: { imported: 0, expired: 1, incompatible: 0 } },
  ]);
});

test("matches on a dot boundary and skips unchosen sites", () => {
  const { cookies, report } = mapChromeCookies([
    cookie,
    { ...cookie, domain: "www.example.com" },
    { ...cookie, domain: "notexample.com" },
  ], { sites: ["example.com", "example.net"], now });

  assert.deepEqual(cookies.map(({ domain }) => domain), [".example.com", "www.example.com"]);
  assert.deepEqual(report, [
    { site: "example.com", result: "imported", counts: { imported: 2, expired: 0, incompatible: 0 } },
    { site: "example.net", result: "skipped", counts: { imported: 0, expired: 0, incompatible: 0 } },
    { site: "notexample.com", result: "skipped", counts: { imported: 0, expired: 0, incompatible: 0 } },
  ]);
});

test("rejects incompatible prefixed cookies and accepts a secure host-only cookie at the root", () => {
  const { cookies, report } = mapChromeCookies([
    { ...cookie, name: "__Secure-sample", secure: false },
    { ...cookie, name: "__Host-sample", path: "/", hostOnly: false },
    { ...cookie, name: "__Host-sample", domain: "www.example.com", hostOnly: true },
    { ...cookie, name: "__Host-sample", domain: "www.example.com", path: "/", secure: false, hostOnly: true },
    { ...cookie, name: "__Host-sample", domain: "www.example.net", path: "/", hostOnly: true },
  ], { sites: ["example.com", "example.net"], now });

  assert.deepEqual(cookies.map(({ name, domain }) => [name, domain]), [["__Host-sample", "www.example.net"]]);
  assert.deepEqual(report, [
    { site: "example.com", result: "incompatible", counts: { imported: 0, expired: 0, incompatible: 4 } },
    { site: "example.net", result: "imported", counts: { imported: 1, expired: 0, incompatible: 0 } },
  ]);
});

test("counts malformed input without exposing its name or value", () => {
  const { cookies, report } = mapChromeCookies([
    { ...cookie, name: 42 },
    { ...cookie, value: { canary } },
    { ...cookie, domain: { canary } },
    canary,
    null,
  ], { sites: ["example.com"], now });

  assert.deepEqual(cookies, []);
  assert.deepEqual(report, [
    { site: "example.com", result: "incompatible", counts: { imported: 0, expired: 0, incompatible: 2 } },
    { site: "(unknown site)", result: "incompatible", counts: { imported: 0, expired: 0, incompatible: 3 } },
  ]);
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test("counts partitioned cookies as incompatible without affecting usable cookies", () => {
  const { cookies, report } = mapChromeCookies([
    cookie,
    { ...cookie, partitionKey: { topLevelSite: "https://example.net" } },
  ], { sites: ["example.com"], now });

  assert.equal(cookies.length, 1);
  assert.deepEqual(report, [
    { site: "example.com", result: "imported", counts: { imported: 1, expired: 0, incompatible: 1 } },
  ]);
});
