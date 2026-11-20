import assert from "node:assert/strict";
import test from "node:test";
import { pickReference, type PageInFront, type SavedRef } from "../src/pomelo/broker/ref-pick.js";

const origin = "https://example.com";
const pageAt = (address: string): PageInFront => ({ topOrigin: address, frameOrigin: address });
const personal: SavedRef = { id: "personal", label: "Personal", account: "personal", allowedOrigins: [origin] };
const work: SavedRef = { id: "work", label: "Work", account: "work", allowedOrigins: [origin] };
const usePersonal = { decision: "use", refId: "personal", label: "Personal" };
const referenceScheme = "op://";

function pick(page: PageInFront, refs: readonly SavedRef[], wanted?: { account?: string }) {
  const result = pickReference(page, refs, wanted);
  assert.ok(!JSON.stringify(result).toLowerCase().includes(referenceScheme));
  return result;
}

test("one reference for the exact origin is offered", () => {
  assert.deepEqual(pick(pageAt(origin), [personal]), usePersonal);
});

test("two accounts for the same origin are offered in label order", () => {
  assert.deepEqual(pick(pageAt(origin), [work, personal]), {
    decision: "ask",
    choices: [{ refId: "personal", label: "Personal" }, { refId: "work", label: "Work" }],
  });
});

test("references with equal labels are ordered by id", () => {
  assert.deepEqual(pick(pageAt(origin), [{ ...work, label: "Personal" }, personal]), {
    decision: "ask",
    choices: [{ refId: "personal", label: "Personal" }, { refId: "work", label: "Personal" }],
  });
});

test("a wanted account narrows the matches and is never echoed", () => {
  assert.deepEqual(pick(pageAt(origin), [personal, work], { account: "work" }), {
    decision: "use", refId: "work", label: "Work",
  });
  const account = "sample account request";
  const result = pick(pageAt(origin), [personal, work], { account });
  assert.equal(result.decision, "hold");
  assert.ok(!JSON.stringify(result).includes(account));
});

test("the picker holds when there is no exact origin match", () => {
  for (const address of ["https://other.test", "https://accounts.example.com", "https://example.com.evil.test"]) {
    assert.equal(pick(pageAt(address), [personal]).decision, "hold", address);
  }
  const wildcard = { ...personal, allowedOrigins: ["https://*.example.com"] };
  assert.equal(pick(pageAt("https://accounts.example.com"), [wildcard]).decision, "hold");
});

test("plain HTTP requires an exact loopback reference", () => {
  for (const address of ["http://example.com", "http://127.example.com", "http://192.0.2.1"]) {
    assert.equal(pick(pageAt(address), [{ ...personal, allowedOrigins: [address] }]).decision, "hold", address);
  }

  for (const address of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.deepEqual(pick(pageAt(address), [{ ...personal, allowedOrigins: [address] }]), usePersonal);
  }

  const loopback = "http://127.0.0.1:3000";
  const ref = { ...personal, allowedOrigins: [loopback] };
  assert.equal(pick(pageAt("http://127.0.0.1:3001"), [ref]).decision, "hold");
  const localhostRef = { ...personal, allowedOrigins: ["http://localhost:3000"] };
  assert.equal(pick(pageAt("https://localhost:3000"), [localhostRef]).decision, "hold");
});

test("IP literals outside the HTTP loopback exception are held", () => {
  for (const address of ["https://192.0.2.1", "https://[2001:db8::1]", "https://127.0.0.1"]) {
    const ref = { ...personal, allowedOrigins: [address] };
    assert.equal(pick(pageAt(address), [ref]).decision, "hold", address);
  }
});

test("default ports and hostname case are normalized, and different ports are held", () => {
  const page = { topOrigin: "https://EXAMPLE.com:443", frameOrigin: origin };
  const explicitDefaultPort = { ...personal, allowedOrigins: ["https://example.com:443"] };
  assert.deepEqual(pick(page, [explicitDefaultPort]), usePersonal);
  assert.equal(pick(pageAt("https://example.com:8443"), [personal]).decision, "hold");
});

test("a frame at a different origin is held even if it also has a reference", () => {
  for (const frameOrigin of ["https://other.test", "https://example.com:8443"]) {
    const frameRef = { ...work, allowedOrigins: [frameOrigin] };
    assert.equal(pick({ topOrigin: origin, frameOrigin }, [personal, frameRef]).decision, "hold");
  }
});

test("revoked references are excluded from every match", () => {
  const revoked = { ...work, revoked: true };
  assert.deepEqual(pick(pageAt(origin), [revoked, personal]), usePersonal);
  assert.equal(pick(pageAt(origin), [revoked]).decision, "hold");
});

test("punycode hosts are held even if explicitly listed", () => {
  const address = "https://xn--exmple-cua.com";
  assert.equal(pick(pageAt(address), [personal]).decision, "hold");
  assert.equal(pick(pageAt(address), [{ ...personal, allowedOrigins: [address] }]).decision, "hold");
});

test("unparseable origins and opaque frames are held", () => {
  assert.equal(pick(pageAt("not an address"), [personal]).decision, "hold");
  for (const frameOrigin of ["not an address", "about:blank"]) {
    assert.equal(pick({ topOrigin: origin, frameOrigin }, [personal]).decision, "hold");
  }
  const invalid = { ...work, allowedOrigins: ["not an address"] };
  assert.deepEqual(pick(pageAt(origin), [invalid, personal]), usePersonal);
});

test("metadata containing the vault reference scheme is never offered", () => {
  for (const ref of [{ ...personal, id: referenceScheme }, { ...personal, label: referenceScheme }]) {
    assert.equal(pick(pageAt(origin), [ref]).decision, "hold");
  }
});
