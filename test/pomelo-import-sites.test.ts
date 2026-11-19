import assert from "node:assert/strict";
import test from "node:test";
import { IMPORT_SITE_LIMIT, importSitePatterns } from "../src/pomelo/import-sites.js";

test("bare hosts and HTTPS URLs yield sorted, exact host permissions", () => {
  assert.deepEqual(importSitePatterns([
    "github.com",
    "https://mail.google.com/inbox",
    "GitHub.com.",
    " HTTPS://GITHUB.COM/settings ",
    "github.com.example",
  ]), {
    sites: ["github.com", "github.com.example", "mail.google.com"],
    patterns: ["https://github.com.example/*", "https://github.com/*", "https://mail.google.com/*"],
    rejected: [],
  });
});

test("unsafe and malformed hosts are rejected in input order with reasons", () => {
  const inputs = [
    "<all_urls>",
    "*://*/*",
    "*.google.com",
    "https://%2A.example.com/",
    "com",
    "127.0.0.1",
    "0x7f000001",
    "[::1]",
    "localhost",
    "http://example.com",
    "example.com:8443",
    "https://example.com:443/",
    "https://example..com/",
    "https:///example.com/",
    " ",
  ];
  const result = importSitePatterns(inputs);
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(result.sites, []);
  assert.deepEqual(result.rejected.map(({ input }) => input), inputs);
  for (const { reason } of result.rejected) assert.ok(reason.trim());
});

test("rejection details omit URL user info and cap long input at 100 characters", () => {
  const userInfo = "user:pw";
  const longInput = `http://example.com/${"x".repeat(150)}`;
  const result = importSitePatterns([
    `https://${userInfo}@example.com`,
    `http://${userInfo}@example.com`,
    `https:///${userInfo}@example.com`,
    "https://@example.com",
    longInput,
  ]);
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(result.sites, []);
  assert.equal(result.rejected.length, 5);
  for (const { reason } of result.rejected) assert.ok(reason.trim());
  assert.equal(result.rejected[4].input, longInput.slice(0, 100));
  const output = JSON.stringify(result);
  assert.equal(output.includes("user:"), false);
  assert.equal(output.includes(":pw"), false);
});

test("a 51st distinct site is rejected and duplicates use no slots", () => {
  assert.equal(IMPORT_SITE_LIMIT, 50);
  const sites = Array.from({ length: IMPORT_SITE_LIMIT }, (_, index) => `site${index}.example.com`);
  const extraSite = "extra.example.com";
  const result = importSitePatterns([sites[0], ...sites, extraSite, `https://${sites[0]}/`]);
  assert.deepEqual(result.sites, [...sites].sort());
  assert.equal(result.patterns.length, IMPORT_SITE_LIMIT);
  assert.deepEqual(result.rejected.map(({ input }) => input), [extraSite]);
  assert.ok(result.rejected[0].reason.trim());
});

test("an empty selection returns empty arrays", () => {
  assert.deepEqual(importSitePatterns([]), { patterns: [], sites: [], rejected: [] });
});
