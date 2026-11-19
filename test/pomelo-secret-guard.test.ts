import assert from "node:assert/strict";
import test from "node:test";
import { secretLines } from "../src/pomelo/secret-guard.js";

const shapedToken = ["gh", "p_", "A".repeat(36)].join("");
const assignedValue = ["fixture", "-only-", "1234"].join("");
const urlValue = ["sample", "-only-", "5678"].join("");
const begin = ["-----BEGIN ", "RSA ", "PRIVATE", " KEY-----"].join("");
const end = ["-----END ", "RSA ", "PRIVATE", " KEY-----"].join("");
const privateBody = ["sample", "+material", "=="].join("");
const privateBlock = [begin, privateBody, shapedToken, end].join("\n");

test("a token on line three returns frozen metadata", () => {
  const path = "src/example.ts";
  const hits = secretLines([{ path, text: ["first", "", shapedToken].join("\n") }]);

  assert.deepEqual(hits, [{ path, line: 3, kind: "secret" }]);
  assert.ok(Object.isFrozen(hits[0]));
});

test("clean text and environment references produce no hits", () => {
  assert.deepEqual(secretLines([
    { path: "README.md", text: "A short example\nwith ordinary words." },
    { path: "example.env", text: "API_KEY=process.env.API_KEY\npassword=${TOKEN}" },
  ]), []);
});

test("a multiline private key reports only its opening line", () => {
  const path = "config/example.pem";
  assert.deepEqual(secretLines([{ path, text: `# Example\n${privateBlock}\n` }]), [
    { path, line: 2, kind: "private-key" },
  ]);
});

test("an already hidden private key produces no hit alongside another secret", () => {
  const path = "config/example.txt";
  const mask = ["[secret ", "hidden]"].join("");
  const text = [begin, mask, end, shapedToken].join("\n");

  assert.deepEqual(secretLines([{ path, text }]), [{ path, line: 4, kind: "secret" }]);
});

test("assigned and URL passwords are reported in line order with no values in the result", () => {
  const path = "config/example.env";
  const url = ["https://", "user:", urlValue, "@example.invalid"].join("");
  const text = [`PASSWORD=${assignedValue}`, "", url].join("\r\n");
  const privatePath = "config/example.pem";
  const hits = secretLines([{ path, text }, { path: privatePath, text: `${privateBlock}\n${shapedToken}` }]);

  const json = JSON.stringify(hits);
  for (const value of [assignedValue, urlValue, privateBlock, privateBody, shapedToken]) {
    assert.ok(!json.includes(value), "the serialized result must omit every planted value");
  }
  assert.deepEqual(hits, [
    { path, line: 1, kind: "secret" },
    { path, line: 3, kind: "secret" },
    { path: privatePath, line: 1, kind: "private-key" },
    { path: privatePath, line: 5, kind: "secret" },
  ]);
});
