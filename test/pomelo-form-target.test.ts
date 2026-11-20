import assert from "node:assert/strict";
import test from "node:test";
import { checkFormTarget } from "../src/pomelo/broker/form-target.js";

const loginForm = {
  pageUrl: "https://example.com/login",
  method: "POST",
  action: "https://example.com/session",
  hasSecretField: true,
};

test("same-origin POST forms can fill with absolute, empty or relative actions", () => {
  for (const action of [loginForm.action, "", "/session"]) {
    assert.equal(checkFormTarget({ ...loginForm, action }).decision, "fill");
  }
});

test("GET forms with secret fields are refused, including a missing method", () => {
  for (const method of ["get", "GET", ""]) {
    const result = checkFormTarget({ ...loginForm, method });
    assert.equal(result.decision, "refuse");
    assert.match(result.reason, /address/);
  }
});

test("a GET search form without a secret field can fill", () => {
  const result = checkFormTarget({ ...loginForm, method: "GET", action: "/search", hasSecretField: false });
  assert.equal(result.decision, "fill");
});

test("a cross-origin HTTPS action is held and names both hosts", () => {
  const result = checkFormTarget({ ...loginForm, action: "//other.test/session" });
  assert.equal(result.decision, "hold");
  assert.match(result.reason, /example\.com/);
  assert.match(result.reason, /other\.test/);
});

test("a different port is a different origin even on the same host", () => {
  const result = checkFormTarget({ ...loginForm, action: "https://example.com:8443/session" });
  assert.equal(result.decision, "hold");
});

test("plain HTTP actions are refused except on localhost and 127.0.0.1", () => {
  for (const host of ["example.com", "localhost.example.com", "127.0.0.2"]) {
    const result = checkFormTarget({ ...loginForm, action: `http://${host}/session` });
    assert.equal(result.decision, "refuse");
  }
  for (const host of ["localhost", "127.0.0.1"]) {
    const result = checkFormTarget({ ...loginForm, pageUrl: `http://${host}:3000/login`, action: "/session" });
    assert.equal(result.decision, "fill");
  }
});

test("javascript, data, file and mailto actions are refused", () => {
  for (const action of ["javascript:void(0)", "data:text/plain,sample", "file:///sample", "mailto:example.test"]) {
    assert.equal(checkFormTarget({ ...loginForm, action }).decision, "refuse");
  }
});

test("an unparsable action is refused", () => {
  assert.equal(checkFormTarget({ ...loginForm, action: "https://[" }).decision, "refuse");
});

test("dialog forms are held, and an unsafe action still refuses", () => {
  assert.equal(checkFormTarget({ ...loginForm, method: "DiAlOg" }).decision, "hold");
  assert.equal(checkFormTarget({ ...loginForm, method: "dialog", action: "http://other.test/session" }).decision, "refuse");
});

test("an unparsable page URL is refused even with an absolute action", () => {
  assert.equal(checkFormTarget({ ...loginForm, pageUrl: "not a URL" }).decision, "refuse");
});

test("form decisions never echo query strings", () => {
  const canary = "made-up-form-target-canary";
  const query = `?sample-query=${canary}`;
  const results = [
    checkFormTarget({ ...loginForm, action: `/session${query}` }),
    checkFormTarget({ ...loginForm, action: `https://other.test/session${query}` }),
    checkFormTarget({ ...loginForm, action: `https://[${query}` }),
  ];
  assert.deepEqual(results.map(({ decision }) => decision), ["fill", "hold", "refuse"]);
  for (const result of results) {
    assert.doesNotMatch(JSON.stringify(result), /sample-query|made-up-form-target-canary/);
  }
});
