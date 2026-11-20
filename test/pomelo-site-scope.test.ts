import assert from "node:assert/strict";
import test from "node:test";
import { siteScopeCheck } from "../src/pomelo/browser/site-scope.js";

const job = {
  scope: ["example.com"],
  fromUrl: "https://example.com/start",
  toUrl: "https://example.com/start",
  reason: "link",
  hasLiveGrant: false,
};

test("allows a move to the same host", () => {
  const result = siteScopeCheck(job);
  assert.equal(result.verdict, "allow");
  assert.equal(result.grantAction, "none");
});

test("allows a different path on the same host with a live grant", () => {
  const result = siteScopeCheck({ ...job, toUrl: "https://example.com/details", hasLiveGrant: true });
  assert.equal(result.verdict, "allow");
  assert.equal(result.grantAction, "none");
});

test("holds a move outside the job scope for approval", () => {
  const result = siteScopeCheck({ ...job, toUrl: "https://other.net" });
  assert.deepEqual(result, {
    verdict: "hold",
    why: "This job wants to leave example.com for other.net",
    grantAction: "none",
  });
});

test("allows a user-approved move outside the scope", () => {
  const result = siteScopeCheck({ ...job, toUrl: "https://other.net", reason: "user-approved" });
  assert.equal(result.verdict, "allow");
  assert.equal(result.grantAction, "none");
});

test("holds hosts that resemble a host in scope", () => {
  for (const host of ["example.com.evil.net", "evil-example.com", "xn--xample-2of.com", "\u0435xample.com"]) {
    assert.equal(siteScopeCheck({ ...job, toUrl: `https://${host}` }).verdict, "hold", host);
  }
});

test("allows a subdomain only when its exact hostname is listed", () => {
  const move = { ...job, toUrl: "https://docs.example.com" };
  assert.equal(siteScopeCheck(move).verdict, "hold");
  assert.equal(siteScopeCheck({ ...move, scope: ["example.com", "docs.example.com"] }).verdict, "allow");
});

test("compares hostnames without case, a trailing dot, or a URL port", () => {
  const toUrl = "https://EXAMPLE.COM.:8443/details";
  assert.equal(siteScopeCheck({ ...job, toUrl }).verdict, "allow");
  assert.equal(siteScopeCheck({ ...job, scope: ["EXAMPLE.COM."] }).verdict, "allow");
});

test("requires revocation before an out-of-scope move even with approval", () => {
  const move = { ...job, toUrl: "https://other.net", hasLiveGrant: true };
  const held = siteScopeCheck(move);
  assert.equal(held.verdict, "hold");
  assert.equal(held.grantAction, "revoke-first");
  const approved = siteScopeCheck({ ...move, reason: "user-approved" });
  assert.equal(approved.verdict, "allow");
  assert.equal(approved.grantAction, "revoke-first");
});

test("still holds a same-host move after a one-step approval outside the scope", () => {
  const toUrl = "https://other.net/details";
  assert.equal(siteScopeCheck({ ...job, fromUrl: "https://other.net/start", toUrl }).verdict, "hold");
});

test("refuses an invalid source or destination even with approval", () => {
  const approved = { ...job, reason: "user-approved" };
  assert.equal(siteScopeCheck({ ...approved, fromUrl: "invalid address" }).verdict, "refuse");
  assert.equal(siteScopeCheck({ ...approved, toUrl: "https://[invalid]" }).verdict, "refuse");
});

test("refuses a destination without a hostname", () => {
  const result = siteScopeCheck({ ...job, toUrl: "about:blank", reason: "user-approved" });
  assert.equal(result.verdict, "refuse");
});

test("keeps paths, query strings, and fragments out of every explanation", () => {
  const canary = "site-scope-test-canary";
  const details = `/${canary}?q=${canary}#${canary}`;
  const fromUrl = `https://example.com${details}`;
  const toUrl = `https://other.net${details}`;
  const results = [
    siteScopeCheck({ ...job, fromUrl, toUrl: fromUrl }),
    siteScopeCheck({ ...job, fromUrl, toUrl }),
    siteScopeCheck({ ...job, fromUrl, toUrl, reason: "user-approved" }),
    siteScopeCheck({ ...job, fromUrl, toUrl: `https://[invalid]${details}` }),
  ];
  assert.deepEqual(results.map(({ verdict }) => verdict), ["allow", "hold", "allow", "refuse"]);
  for (const { why } of results) {
    assert.equal(why.includes(canary), false);
  }
});
