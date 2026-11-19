import assert from "node:assert/strict";
import test from "node:test";
import { NET_MASK, maskConsole, maskRequest, maskResponse } from "../src/pomelo/browser/net-mask.js";
import { HIDDEN } from "../src/secrets.js";

const address = "https://example.invalid/path";

test("request and response headers mask sensitive names without regard to case", () => {
  assert.equal(NET_MASK, "••••");
  const sensitive = [
    "Cookie", "Set-CooKIE", "AUTHORIZATION", "Proxy-Authorization", "X-Access-ToKeN",
    "X-Client-SeCrEt", "X-API-KEY", "X-ApiKey-Id", "X-Session-Id",
  ];
  const ordinary = { Accept: "*/*", "X-Authorization-Scheme": "example" };
  const headers = { ...ordinary, ...Object.fromEntries(sensitive.map((name) => [name, "fixture"])) };
  const expected = { ...ordinary, ...Object.fromEntries(sensitive.map((name) => [name, NET_MASK])) };

  assert.deepEqual(maskRequest({ method: "GET", url: address, headers }).headers, expected);
  assert.deepEqual(maskResponse({ status: 200, url: address, headers }).headers, expected);
});

test("URLs remove credentials and mask query and fragment values while preserving the path and other parameters", () => {
  const sensitive = ["ToKeN", "access_token", "id_token", "code", "key", "api_key", "password", "secret", "sig", "signature", "session"];
  const query = sensitive.map((name) => `${name}=fixture`).join("&");
  const url = `https://fixture:example@example.invalid:8443/path%20here?${query}&%74oken=second&flag&note=a%20b#route?${query}&token=&tab=details`;
  const records = [
    maskRequest({ method: "GET", url, headers: {} }),
    maskResponse({ status: 200, url, headers: {} }),
  ];
  for (const record of records) {
    const masked = new URL(record.url);
    assert.equal(masked.username, "");
    assert.equal(masked.password, "");
    assert.equal(masked.host, "example.invalid:8443");
    assert.equal(masked.pathname, "/path%20here");
    assert.ok(masked.search.endsWith("&flag&note=a%20b"));
    assert.deepEqual(masked.searchParams.getAll("token"), [NET_MASK]);
    assert.ok(masked.hash.startsWith("#route?"));
    const fragment = new URLSearchParams(masked.hash.slice("#route?".length));
    for (const name of sensitive) {
      assert.equal(masked.searchParams.get(name), NET_MASK);
      assert.equal(fragment.get(name), NET_MASK);
    }
    assert.equal(fragment.get("token"), NET_MASK);
    assert.equal(fragment.get("tab"), "details");
  }

  const fragmentMask = encodeURIComponent(NET_MASK);
  for (const prefix of ["#", "#?"]) {
    assert.equal(
      maskResponse({ status: 200, url: `${address}${prefix}token=one?two&token=three`, headers: {} }).url,
      `${address}${prefix}token=${fragmentMask}&token=${fragmentMask}`,
    );
  }
  assert.equal(maskResponse({ status: 200, url: `${address}#details`, headers: {} }).url, `${address}#details`);
});

test("request bodies leave only a UTF-8 byte count", () => {
  const request = { method: "POST", url: address, headers: {} };
  assert.deepEqual(maskRequest({ ...request, postData: "aé漢🍊\ud800" }), { ...request, bodyBytes: 13 });
  assert.deepEqual(maskRequest({ ...request, postData: "" }), { ...request, bodyBytes: 0 });
  assert.deepEqual(maskRequest({ ...request, postData: null }), { ...request, bodyBytes: 0 });
  assert.deepEqual(maskRequest(request), { ...request, bodyBytes: 0 });
});

test("console masks all known literal and URL-encoded values before Friday's secret shield", () => {
  const value = "fixture /+[é]";
  const percentEncoded = encodeURIComponent(value);
  const lowercaseEscapes = percentEncoded.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase());
  const formEncoded = new URLSearchParams({ value }).toString().slice("value=".length);
  const line = [value, value, percentEncoded, lowercaseEscapes, formEncoded, encodeURI(value)].join(" | ");
  const shieldFixture = "x".repeat(20);
  assert.equal(
    maskConsole(`${line}\nBearer ${shieldFixture}`, Object.freeze(["", "fixture", value])),
    `${Array(6).fill(NET_MASK).join(" | ")}\nBearer …${HIDDEN}`,
  );
  assert.equal(maskConsole(`Bearer ${shieldFixture}`, [shieldFixture]), `Bearer ${NET_MASK}`);
  assert.equal(maskConsole("abcdef", ["abc", "bcdef"]), NET_MASK);
  assert.equal(maskConsole("a b", ["a"]), `${NET_MASK} b`);
});

test("unparseable URLs are replaced in both kinds of network record", () => {
  const url = "https://[fixture/path?token=example";
  assert.equal(maskRequest({ method: "GET", url, headers: {} }).url, "[unreadable address]");
  assert.equal(maskResponse({ status: 200, url, headers: {} }).url, "[unreadable address]");
});

test("masking leaves input records and their headers untouched", () => {
  const headers = Object.freeze({ Cookie: "fixture", Accept: "text/plain" });
  const url = `${address}?token=fixture`;
  const request = Object.freeze({ method: "POST", url, headers, postData: "fixture" });
  const response = Object.freeze({ status: 200, url, headers });
  const maskedRequest = maskRequest(request);
  const maskedResponse = maskResponse(response);
  assert.notEqual(maskedRequest, request);
  assert.notEqual(maskedResponse, response);
  assert.notEqual(maskedRequest.headers, headers);
  assert.notEqual(maskedResponse.headers, headers);
  assert.deepEqual(request, { method: "POST", url, headers, postData: "fixture" });
  assert.deepEqual(response, { status: 200, url, headers });
  assert.deepEqual(headers, { Cookie: "fixture", Accept: "text/plain" });
});

test("serialized browser records contain none of the planted canary forms", () => {
  const canary = "canary-" + "p2-26-" + "x".repeat(12) + "/+";
  const encoded = encodeURIComponent(canary);
  const basic = Buffer.from(`fixture:${canary}`).toString("base64");
  const url = `https://fixture:${encoded}@example.invalid/path?token=${encoded}`;
  const results = [
    maskRequest({
      method: "POST", url, headers: { Cookie: `fixture=${canary}`, Authorization: `Bearer ${canary}` },
      postData: JSON.stringify({ fixture: canary }),
    }),
    maskRequest({ method: "GET", url: address, headers: { Authorization: `Basic ${basic}` } }),
    maskResponse({ status: 200, url, headers: { "Set-Cookie": `fixture=${canary}; Secure` } }),
    maskConsole(`logged ${canary} and ${encoded}`, [canary]),
  ];
  const serialized = JSON.stringify(results);
  for (const form of [canary, encoded, basic]) {
    assert.ok(!serialized.includes(form), "the serialized output must not contain any form of the canary");
  }
});
