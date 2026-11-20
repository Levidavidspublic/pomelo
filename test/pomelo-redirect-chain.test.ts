import assert from "node:assert/strict";
import test from "node:test";
import { checkRedirectChain, MAX_REDIRECT_HOPS } from "../src/pomelo/browser/redirect-chain.js";

const startAddress = "https://start.example.test/";

function check(addresses: readonly string[], hasFillGrant = false, startSite = "start.example.test") {
  const hops = addresses.map((address, index) => ({ address, status: index === addresses.length - 1 ? 200 : 302 }));
  return checkRedirectChain({ hops, startSite, hasFillGrant });
}

test("allows a single HTTPS hop and HTTPS redirects within the starting site", () => {
  assert.equal(check([startAddress]).decision, "allow");
  assert.equal(check([startAddress, "https://LOGIN.EXAMPLE.TEST./next"], true, "START.EXAMPLE.TEST.").decision, "allow");
});

test("allows the hop limit and refuses one hop over it", () => {
  const addresses = Array.from({ length: MAX_REDIRECT_HOPS }, (_, index) => `${startAddress}${index}`);
  assert.equal(check(addresses).decision, "allow");
  const result = check([...addresses, `${startAddress}end`]);
  assert.equal(result.decision, "refuse");
  assert.equal(result.reason, "too-many-hops");
});

test("refuses a repeated address and reports only its host", () => {
  const result = check([startAddress, `${startAddress}next`, "https://START.EXAMPLE.TEST:443/#section"]);
  assert.equal(result.decision, "refuse");
  assert.equal(result.reason, "loop");
  assert.equal(result.host, "start.example.test");
});

test("refuses redirects to non-web schemes", () => {
  for (const address of ["file:///fixture.txt", "javascript:void(0)", "data:text/plain,fixture", "chrome://settings", "about:blank"]) {
    const result = check([startAddress, address]);
    assert.equal(result.decision, "refuse", address);
    assert.equal(result.reason, "unsupported-scheme", address);
  }
});

test("holds a downgrade on an intermediate hop", () => {
  const result = check([startAddress, "http://next.example.test/", "https://end.example.test/"]);
  assert.equal(result.decision, "hold");
  assert.equal(result.reason, "downgrade");
  assert.equal(result.host, "next.example.test");
  assert.equal(check(["http://start.example.test/", startAddress]).decision, "allow");
});

test("holds private-network hops even when the final address is public", () => {
  for (const host of [
    "127.0.0.1", "localhost", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.1.2",
    "[::1]", "[fd00::1]", "[febf::1]", "[::ffff:127.0.0.1]", "0x7f000001", "Service.Localhost.",
  ]) {
    const result = check([startAddress, `https://${host}/`, `${startAddress}done`]);
    assert.equal(result.decision, "hold", host);
    assert.equal(result.reason, "private-network", host);
  }
});

test("allows public IP addresses outside the private ranges", () => {
  for (const host of ["172.15.0.1", "172.32.0.1", "[2001:db8::1]", "[::ffff:192.0.2.1]"]) {
    assert.equal(check([startAddress, `https://${host}/`]).decision, "allow", host);
  }
});

test("holds a different final site only when the job has a fill grant", () => {
  const offSite = "https://login.other.test/";
  const result = check([startAddress, offSite], true);
  assert.equal(result.decision, "hold");
  assert.equal(result.reason, "new-site");
  assert.equal(result.host, "login.other.test");
  assert.equal(check([startAddress, offSite]).decision, "allow");
  assert.equal(check([startAddress, offSite, `${startAddress}done`], true).decision, "allow");
  assert.equal(check(["https://192.0.2.1/"], true, "198.51.2.1").reason, "new-site");
});

test("refuses a malformed address and an empty chain", () => {
  const malformed = check([startAddress, "not an address"]);
  assert.equal(malformed.decision, "refuse");
  assert.equal(malformed.reason, "bad-address");
  const empty = check([]);
  assert.equal(empty.decision, "refuse");
  assert.equal(empty.reason, "empty-chain");
});

test("reports the first refusal even after an earlier hold", () => {
  const privateAddress = "https://10.0.0.1/";
  const result = check([startAddress, privateAddress, startAddress, "not an address"]);
  assert.equal(result.decision, "refuse");
  assert.equal(result.reason, "loop");
});

test("reports the first hold when no hop is refused", () => {
  const privateAddress = "https://10.0.0.1/";
  assert.equal(check([startAddress, privateAddress, "http://next.example.test/"]).reason, "private-network");
  assert.equal(check([startAddress, "http://next.example.test/", privateAddress]).reason, "downgrade");
});

test("returns a message without exposing address paths, queries or fragments", () => {
  const canary = "redirect-fixture-canary";
  const suffix = `/${canary}?q=${canary}#${canary}`;
  const downgrade = `http://${canary}@start.example.test:8080${suffix}`;
  const result = check([startAddress, downgrade]);
  assert.equal(result.reason, "downgrade");
  assert.equal(result.host, "start.example.test");
  assert.ok(result.message.includes("start.example.test"));
  for (const outcome of [result, check([`${startAddress}${suffix}`]), check([`file://${suffix}`]), check([`bad address${suffix}`])]) {
    assert.ok(outcome.message);
    assert.equal(JSON.stringify(outcome).includes(canary), false);
  }
});
