import assert from "node:assert/strict";
import test from "node:test";
import { checkFillTarget, type FillGrant } from "../src/pomelo/broker/fill-match.js";

const grant: FillGrant = { origin: "https://example.com", frame: "top" };
const sameOriginGrant: FillGrant = { ...grant, frame: "same-origin" };
const pageUrl = `${grant.origin}/login`;
const topFrame = (url: string) => ({ pageUrl: url, frameUrl: url, isTopFrame: true });
const childFrame = (frameUrl: string) => ({ pageUrl, frameUrl, isTopFrame: false });

test("a top-frame fill allows the granted origin", () => {
  for (const activeGrant of [grant, sameOriginGrant]) {
    const result = checkFillTarget(activeGrant, topFrame(pageUrl));
    assert.equal(result.decision, "allow");
    assert.match(result.reason, /example\.com/);
  }
});

test("a browser origin ignores ordinary URL case, paths and the default port", () => {
  const url = "HTTPS://Example.com:443/sign-in?mode=preview#section";
  const result = checkFillTarget(grant, topFrame(url));
  assert.equal(result.decision, "allow");
  assert.match(result.reason, /example\.com/);
  assert.doesNotMatch(result.reason, /sign-in|mode|preview|section|443/);
});

test("a fill refuses subdomains, parent domains and different ports", () => {
  assert.equal(checkFillTarget(grant, topFrame("https://login.example.com/")).decision, "refuse");
  const subdomainGrant = { ...grant, origin: "https://login.example.com" };
  assert.equal(checkFillTarget(subdomainGrant, topFrame(pageUrl)).decision, "refuse");
  assert.equal(checkFillTarget(grant, topFrame("https://example.com:8443/")).decision, "refuse");
  const customPortGrant = { ...grant, origin: "https://example.com:8443" };
  assert.equal(checkFillTarget(customPortGrant, topFrame("https://example.com:8443/")).decision, "allow");
});

test("a fill refuses trailing dots, punycode labels and disguised host spelling", () => {
  for (const [origin, url] of [
    ["https://example.com.", "https://example.com./"],
    ["https://xn--exmple-cua.com", "https://xn--exmple-cua.com/"],
    [grant.origin, "https://Ｅxample.com/"],
    [grant.origin, "https://%65xample.com/"],
  ]) {
    assert.equal(checkFillTarget({ ...grant, origin }, topFrame(url)).decision, "refuse", url);
  }
});

test("plain HTTP fills require a grant for localhost or 127.0.0.1", () => {
  assert.equal(checkFillTarget(grant, topFrame("http://example.com/")).decision, "refuse");
  for (const host of ["localhost", "127.0.0.1"]) {
    const origin = `http://${host}:3000`;
    const localGrant = { ...grant, origin };
    assert.equal(checkFillTarget(localGrant, topFrame(`${origin}/login`)).decision, "allow");
    assert.equal(checkFillTarget(localGrant, topFrame(`http://${host}:3001/login`)).decision, "refuse");
  }
  for (const host of ["example.com", "local.localhost", "127.0.0.2", "[::1]"]) {
    const origin = `http://${host}:3000`;
    assert.equal(checkFillTarget({ ...grant, origin }, topFrame(`${origin}/login`)).decision, "refuse");
  }
  const ipv4Grant = { ...grant, origin: "http://127.0.0.1:3000" };
  for (const host of ["127.0.0.1.", "127.1"]) {
    assert.equal(checkFillTarget(ipv4Grant, topFrame(`http://${host}:3000/login`)).decision, "refuse");
  }
});

test("only a same-origin grant allows a same-origin child frame", () => {
  const target = childFrame("https://example.com/embedded-form");
  assert.equal(checkFillTarget(grant, target).decision, "refuse");
  assert.equal(checkFillTarget(sameOriginGrant, target).decision, "allow");
});

test("a fill refuses a cross-origin frame even when the page is granted", () => {
  for (const frameUrl of ["https://other.test/form", "https://example.com:8443/form"]) {
    assert.equal(checkFillTarget(sameOriginGrant, childFrame(frameUrl)).decision, "refuse");
  }
  const inconsistentTopFrame = { ...topFrame(pageUrl), frameUrl: "https://other.test/form" };
  assert.equal(checkFillTarget(grant, inconsistentTopFrame).decision, "refuse");
  const ungrantedPage = { ...childFrame(pageUrl), pageUrl: "https://other.test/" };
  assert.equal(checkFillTarget(sameOriginGrant, ungrantedPage).decision, "refuse");
});

test("a fill refuses data, blob, about and file frames", () => {
  for (const frameUrl of ["data:text/html,sample", "blob:https://example.com/sample", "about:blank", "file:///form.html"]) {
    assert.equal(checkFillTarget(sameOriginGrant, childFrame(frameUrl)).decision, "refuse", frameUrl);
  }
});

test("unparseable page, frame and grant addresses refuse without throwing", () => {
  const badUrl = "not an address";
  assert.equal(checkFillTarget(grant, topFrame(badUrl)).decision, "refuse");
  assert.equal(checkFillTarget(grant, { ...topFrame(pageUrl), frameUrl: badUrl }).decision, "refuse");
  assert.equal(checkFillTarget({ ...grant, origin: badUrl }, topFrame(pageUrl)).decision, "refuse");
});

test("fill decisions never include URL paths, query values or fragments", () => {
  const canary = "made-up-fill-canary";
  const suffix = `/sample-form?sample-query=${canary}#sample-fragment`;
  const grantedPage = `${grant.origin}${suffix}`;
  const otherPage = `https://other.test${suffix}`;
  const results = [
    checkFillTarget(grant, topFrame(grantedPage)),
    checkFillTarget(grant, topFrame(otherPage)),
    checkFillTarget(grant, { ...childFrame(grantedPage), pageUrl: grantedPage }),
    checkFillTarget(sameOriginGrant, { ...childFrame(otherPage), pageUrl: grantedPage }),
    checkFillTarget(grant, topFrame(`bad address${suffix}`)),
  ];
  assert.deepEqual(results.map(({ decision }) => decision), ["allow", "refuse", "refuse", "refuse", "refuse"]);
  for (const { reason } of results) {
    assert.doesNotMatch(reason, /sample-form|sample-query|sample-fragment/);
    assert.ok(!reason.includes(canary));
  }
});
