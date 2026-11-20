import assert from "node:assert/strict";
import test from "node:test";
import { certStop, type CertStopAction, type PageSecurityFacts } from "../src/pomelo/browser/cert-stop.js";

const securePage: PageSecurityFacts = {
  url: "https://example.test/login",
  securityState: "secure",
  isInterstitial: false,
  hasMixedActiveContent: false,
};
const browsingActions = ["read", "click"] as const;
const secretActions = ["fill", "import"] as const;
const actions = [...browsingActions, ...secretActions];

function assertResult(
  facts: PageSecurityFacts,
  action: CertStopAction,
  verdict: "go" | "hold" | "refuse",
  card?: "certificate",
) {
  const result = certStop(facts, action);
  assert.equal(result.verdict, verdict, action);
  assert.equal(result.card, card, action);
  assert.deepEqual(Object.keys(result).sort(), card ? ["card", "reason", "verdict"] : ["reason", "verdict"]);
  assert.match(result.reason, /\.$/);
  return result;
}

function assertCertificateStop(facts: PageSecurityFacts) {
  for (const action of browsingActions) assertResult(facts, action, "hold", "certificate");
  for (const action of secretActions) assertResult(facts, action, "refuse");
}

test("allows every action on a secure page with no issues", () => {
  for (const action of actions) assertResult(securePage, action, "go");
});

for (const [issue, errorText] of [
  ["expired", "net::ERR_CERT_DATE_INVALID"],
  ["wrong host", "page.goto: net::ERR_CERT_COMMON_NAME_INVALID at https://example.test/login"],
  ["unknown issuer", "net::ERR_CERT_AUTHORITY_INVALID"],
  ["revoked", "net::ERR_CERT_REVOKED"],
  ["self-signed", "self-signed certificate"],
]) {
  test(`stops for a certificate error involving ${issue}`, () => {
    assertCertificateStop({ ...securePage, errorText });
  });
}

test("stops for a reported certificate issue even without load error text", () => {
  assertCertificateStop({ ...securePage, certIssues: ["untrusted issuer"] });
});

test("stops at an interstitial even on loopback without load error text", () => {
  assertCertificateStop({ ...securePage, isInterstitial: true });
  assertCertificateStop({ ...securePage, url: "http://localhost:8080/", isInterstitial: true });
});

test("allows browsing and holds fills and imports for active mixed content", () => {
  const mixedPage = { ...securePage, hasMixedActiveContent: true };
  for (const action of browsingActions) assertResult(mixedPage, action, "go");
  for (const action of secretActions) assertResult(mixedPage, action, "hold");
});

test("refuses fills and imports when security is unknown, missing or insecure", () => {
  for (const securityState of ["unknown", undefined, "insecure"] as const) {
    for (const action of secretActions) assertResult({ ...securePage, securityState }, action, "refuse");
  }
});

test("allows browsing on HTTP loopback but refuses fills and imports", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const page = { ...securePage, url: `http://${host}:8080/login`, securityState: "insecure" } as const;
    for (const action of browsingActions) assertResult(page, action, "go");
    for (const action of secretActions) assertResult(page, action, "refuse");
  }
});

test("treats a loopback look-alike as a remote HTTP host", () => {
  const page = { ...securePage, url: "http://localhost.example.com/login" };
  for (const action of browsingActions) assertResult(page, action, "hold");
  for (const action of secretActions) assertResult(page, action, "refuse");
});

test("names only the host and omits raw certificate details from the reason", () => {
  const page = {
    ...securePage,
    url: "https://example.test:8443/path-canary?check=query-canary#fragment-canary",
    errorText: "net::ERR_CERT_INVALID raw-error-canary",
    certIssues: ["certificate-details-canary"],
  };
  for (const action of actions) {
    const { reason } = certStop(page, action);
    assert.match(reason, /example\.test/);
    assert.doesNotMatch(reason, /https:\/\/|8443|canary|ERR_CERT/);
  }
});

test("refuses an invalid URL without returning any part of it", () => {
  for (const action of actions) {
    const result = assertResult({ ...securePage, url: "not an address?check=query-canary" }, action, "refuse");
    assert.doesNotMatch(result.reason, /query-canary/);
  }
});
