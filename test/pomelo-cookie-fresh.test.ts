import assert from "node:assert/strict";
import test from "node:test";
import { sortImportCookies } from "../src/pomelo/cookie-fresh.js";

const nowMs = 1_800_000_000_000;
const nowSeconds = nowMs / 1000;
const cookie = {
  domain: "example.com",
  name: "fixture-cookie-name",
  value: "fixture-cookie-value",
  expirationDate: nowSeconds + 60,
};

test("keeps fresh and session cookies and drops Chrome expiries at or before now", () => {
  const { keep, drop, perSite } = sortImportCookies([
    cookie,
    { ...cookie, expirationDate: nowSeconds - 1 },
    { ...cookie, expirationDate: nowSeconds },
    { ...cookie, expirationDate: undefined, session: true },
    { ...cookie, expirationDate: nowSeconds + 0.001 },
  ], ["example.com"], nowMs);

  assert.deepEqual(keep, [0, 3, 4]);
  assert.deepEqual(drop, [
    { index: 1, site: "example.com", why: "expired" },
    { index: 2, site: "example.com", why: "expired" },
  ]);
  assert.deepEqual(perSite, [{ site: "example.com", kept: 3, expired: 2, wrongSite: 0, tooBig: 0, bad: 0 }]);
});

test("matches chosen sites on a domain boundary and credits the most specific site", () => {
  const { keep, drop, perSite } = sortImportCookies([
    { ...cookie, domain: "www.example.com" },
    { ...cookie, domain: ".EXAMPLE.COM" },
    { ...cookie, domain: ".shop.example.com" },
    { ...cookie, domain: "notexample.com" },
    { ...cookie, domain: "unpicked.example.net" },
  ], ["example.com", "shop.example.com"], nowMs);

  assert.deepEqual(keep, [0, 1, 2]);
  assert.deepEqual(drop, [
    { index: 3, site: "notexample.com", why: "wrong site" },
    { index: 4, site: "unpicked.example.net", why: "wrong site" },
  ]);
  assert.deepEqual(perSite, [
    { site: "example.com", kept: 2, expired: 0, wrongSite: 0, tooBig: 0, bad: 0 },
    { site: "shop.example.com", kept: 1, expired: 0, wrongSite: 0, tooBig: 0, bad: 0 },
    { site: "notexample.com", kept: 0, expired: 0, wrongSite: 1, tooBig: 0, bad: 0 },
    { site: "unpicked.example.net", kept: 0, expired: 0, wrongSite: 1, tooBig: 0, bad: 0 },
  ]);
});

test("enforces the combined UTF-8 byte limit for the cookie name and value", () => {
  const { keep, drop, perSite } = sortImportCookies([
    { ...cookie, name: "é", value: "é".repeat(2047) },
    { ...cookie, name: "é", value: "é".repeat(2047) + "a" },
  ], ["example.com"], nowMs);

  assert.deepEqual(keep, [0]);
  assert.deepEqual(drop, [{ index: 1, site: "example.com", why: "too big" }]);
  assert.equal(perSite[0].tooBig, 1);
});

test("counts unreadable cookie fields without invoking accessors", () => {
  let reads = 0;
  const { keep, drop } = sortImportCookies([
    { name: cookie.name, value: cookie.value },
    { ...cookie, domain: "https://example.com/path" },
    { ...cookie, expirationDate: "tomorrow" },
    { ...cookie, expirationDate: Infinity },
    { ...cookie, get expirationDate() { return ++reads; } },
    { ...cookie, get domain() { return String(++reads); } },
  ], ["example.com"], nowMs);

  assert.equal(reads, 0);
  assert.deepEqual(keep, []);
  assert.deepEqual(drop, [
    { index: 0, site: "(unknown site)", why: "bad" },
    { index: 1, site: "(unknown site)", why: "bad" },
    { index: 2, site: "example.com", why: "bad" },
    { index: 3, site: "example.com", why: "bad" },
    { index: 4, site: "example.com", why: "bad" },
    { index: 5, site: "(unknown site)", why: "bad" },
  ]);
});

test("caps kept cookies per site and accounts for each input once", () => {
  const cookies = [
    { ...cookie, expirationDate: nowSeconds },
    cookie,
    { ...cookie, domain: "www.example.com" },
    { ...cookie, domain: "example.net" },
    { ...cookie, domain: "example.org" },
    { ...cookie, value: "x".repeat(4096) },
    null,
  ];
  const { keep, drop, perSite } = sortImportCookies(cookies, ["example.com", "example.net"], nowMs, { maxPerSite: 1 });

  assert.deepEqual(keep, [1, 3]);
  assert.deepEqual(drop, [
    { index: 0, site: "example.com", why: "expired" },
    { index: 2, site: "example.com", why: "site limit" },
    { index: 4, site: "example.org", why: "wrong site" },
    { index: 5, site: "example.com", why: "too big" },
    { index: 6, site: "(unknown site)", why: "bad" },
  ]);
  assert.deepEqual(perSite[0], { site: "example.com", kept: 1, expired: 1, wrongSite: 0, tooBig: 1, bad: 1 });
  const total = perSite.reduce((sum, { kept, expired, wrongSite, tooBig, bad }) => sum + kept + expired + wrongSite + tooBig + bad, 0);
  assert.equal(total, cookies.length);

  const defaults = sortImportCookies(Array.from({ length: 3001 }, () => cookie), ["example.com"], nowMs);
  assert.deepEqual(defaults.keep, Array.from({ length: 3000 }, (_, index) => index));
  assert.deepEqual(defaults.drop, [{ index: 3000, site: "example.com", why: "site limit" }]);
});

test("the serialized result omits cookie names and values from kept and dropped cookies", () => {
  const canary = "synthetic-cookie-freshness-canary";
  const cookies = [
    { ...cookie, value: canary },
    { ...cookie, name: "fixture-dropped-cookie-name", value: `${canary}-dropped`, expirationDate: nowSeconds },
    { ...cookie, domain: `https://example.com/${canary}` },
  ];
  const json = JSON.stringify(sortImportCookies(cookies, ["example.com"], nowMs));

  for (const { name, value } of cookies) {
    assert.equal(json.includes(name), false);
    assert.equal(json.includes(value), false);
  }
});
