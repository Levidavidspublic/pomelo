import assert from "node:assert/strict";
import test from "node:test";
import { mapCookiesForChrome } from "../src/pomelo/cookie-export.js";

const canary = "pomelo-fake-export-cookie-canary";
const now = 1_800_000_000;
const cookie = {
  name: "sample",
  value: canary,
  domain: ".example.com",
  path: "/account",
  expires: now + 60,
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
};
const options = { sites: ["example.com"], now };

test("maps browser cookie fields and SameSite settings to Chrome", () => {
  const { cookies, report } = mapCookiesForChrome([
    { ...cookie, sameSite: "None" },
    cookie,
    { ...cookie, sameSite: "Strict" },
    { ...cookie, sameSite: "unknown" },
    { ...cookie, domain: "APP.Example.com", secure: false, httpOnly: false, sameSite: undefined },
    { ...cookie, value: "" },
  ], options);
  const expected = {
    url: "https://example.com/account",
    name: "sample",
    value: canary,
    domain: ".example.com",
    path: "/account",
    secure: true,
    httpOnly: true,
    expirationDate: now + 60,
  };
  assert.deepEqual(cookies, [
    { ...expected, sameSite: "no_restriction" },
    { ...expected, sameSite: "lax" },
    { ...expected, sameSite: "strict" },
    expected,
    {
      url: "http://app.example.com/account",
      name: "sample",
      value: canary,
      path: "/account",
      secure: false,
      httpOnly: false,
      expirationDate: now + 60,
    },
    { ...expected, value: "", sameSite: "lax" },
  ]);
  assert.deepEqual(report, [
    { site: "example.com", result: "exported", counts: { exported: 6, expired: 0, incompatible: 0 } },
  ]);
});

test("omits session expirations and counts expired cookies in Unix seconds", () => {
  const { cookies, report } = mapCookiesForChrome([
    { ...cookie, expires: -1 },
    { ...cookie, expires: undefined },
    { ...cookie, expires: now },
    { ...cookie, expires: now - 1 },
    { ...cookie, expires: now - 1, domain: "example.net" },
  ], { sites: ["example.com", "example.net"], now });

  assert.equal(cookies.length, 3);
  assert.deepEqual(cookies.map((entry) => Object.hasOwn(entry, "expirationDate")), [false, false, true]);
  assert.equal(cookies[2].expirationDate, now);
  assert.deepEqual(report, [
    { site: "example.com", result: "exported", counts: { exported: 3, expired: 1, incompatible: 0 } },
    { site: "example.net", result: "expired", counts: { exported: 0, expired: 1, incompatible: 0 } },
  ]);
});

test("credits the most specific chosen site and reports each unchosen host once", () => {
  const input = Object.freeze([
    Object.freeze({ ...cookie, domain: ".Example.COM" }),
    Object.freeze({ ...cookie, domain: ".App.Example.COM" }),
    Object.freeze({ ...cookie, domain: "private.app.example.com" }),
    Object.freeze({ ...cookie, domain: "notexample.com" }),
    Object.freeze({ ...cookie, domain: ".NotExample.COM", secure: false, sameSite: "None" }),
  ]);
  const sites = Object.freeze(["example.com", ".APP.EXAMPLE.COM", "example.net"]);
  const { cookies, report } = mapCookiesForChrome(input, { sites, now });

  assert.deepEqual(cookies.map(({ url }) => url), [
    "https://example.com/account", "https://app.example.com/account", "https://private.app.example.com/account",
  ]);
  assert.deepEqual(report, [
    { site: "example.com", result: "exported", counts: { exported: 1, expired: 0, incompatible: 0 } },
    { site: ".APP.EXAMPLE.COM", result: "exported", counts: { exported: 2, expired: 0, incompatible: 0 } },
    { site: "example.net", result: "skipped", counts: { exported: 0, expired: 0, incompatible: 0 } },
    { site: "notexample.com", result: "skipped", counts: { exported: 0, expired: 0, incompatible: 0 } },
  ]);
  assert.equal(JSON.stringify(report).includes(canary), false);
});

for (const [rule, overrides] of [
  ["a missing name", { name: undefined }],
  ["a missing value", { value: undefined }],
  ["a path without a leading slash", { path: "account" }],
  ["a missing path", { path: undefined }],
  ["a non-boolean secure field", { secure: "true" }],
  ["a non-boolean httpOnly field", { httpOnly: 1 }],
  ["a nonnumeric expiration", { expires: "tomorrow" }],
  ["a nonfinite expiration", { expires: Infinity }],
  ["an insecure __Secure- cookie", { name: "__Secure-sample", secure: false }],
  ["an insecure __Host- cookie", { name: "__Host-sample", domain: "example.com", secure: false, path: "/" }],
  ["a domain-scoped __Host- cookie", { name: "__Host-sample", path: "/" }],
  ["a non-root __Host- cookie", { name: "__Host-sample", domain: "example.com" }],
  ["SameSite=None without secure", { sameSite: "None", secure: false }],
  ["a partition key", { partitionKey: { topLevelSite: "https://example.net" } }],
  ["an undefined partition key field", { partitionKey: undefined }],
] as const) {
  test(`counts ${rule} as incompatible`, () => {
    const { cookies, report } = mapCookiesForChrome([{ ...cookie, ...overrides }], options);

    assert.deepEqual(cookies, []);
    assert.deepEqual(report, [
      { site: "example.com", result: "incompatible", counts: { exported: 0, expired: 0, incompatible: 1 } },
    ]);
  });
}

test("exports compatible prefixed cookies", () => {
  const { cookies } = mapCookiesForChrome([
    { ...cookie, name: "__Secure-sample" },
    { ...cookie, name: "__Host-sample", domain: "example.com", path: "/" },
  ], options);

  assert.deepEqual(cookies.map(({ name, url, domain }) => [name, url, domain]), [
    ["__Secure-sample", "https://example.com/account", ".example.com"],
    ["__Host-sample", "https://example.com/", undefined],
  ]);
});

test("counts input without a usable host without copying its contents to the report", () => {
  const { cookies, report } = mapCookiesForChrome([
    null,
    canary,
    [canary],
    { ...cookie, domain: undefined },
    { ...cookie, domain: { canary } },
    { ...cookie, domain: "" },
    { ...cookie, domain: "other.test/path.example.com" },
  ], options);

  assert.deepEqual(cookies, []);
  assert.deepEqual(report, [
    { site: "example.com", result: "skipped", counts: { exported: 0, expired: 0, incompatible: 0 } },
    { site: "(unknown site)", result: "incompatible", counts: { exported: 0, expired: 0, incompatible: 7 } },
  ]);
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test("counts unreadable cookie fields without exposing thrown error text", () => {
  const unreadable = { ...cookie, get value(): string { throw new Error(canary); } };
  const { cookies, report } = mapCookiesForChrome([
    unreadable,
    { ...cookie, expires: now - 1 },
  ], options);

  assert.deepEqual(cookies, []);
  assert.deepEqual(report, [
    { site: "example.com", result: "incompatible", counts: { exported: 0, expired: 1, incompatible: 1 } },
  ]);
  assert.equal(JSON.stringify(report).includes(canary), false);
});
