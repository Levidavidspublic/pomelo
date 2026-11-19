import assert from "node:assert/strict";
import test from "node:test";
import { assertNoCanary, canaryForms, sweepForCanary } from "../src/pomelo/canary-sweep.js";

const canary = ["pomelo-canary", '7f"3\\a', "ÿÿÿ", "91c2e5"].join("-");

test("finds plain occurrences at their offsets in the source text", () => {
  const prefix = "🧪 Value: ";
  const separator = " and ";
  assert.deepEqual(sweepForCanary(canary, { input: prefix + canary + separator + canary }), [
    { source: "input", form: "plain", at: prefix.length },
    { source: "input", form: "plain", at: prefix.length + canary.length + separator.length },
  ]);
});

test("finds a canary with a quote and backslash inside an escaped JSON string", () => {
  const log = JSON.stringify({ message: `value=${canary}` });
  assert.deepEqual(sweepForCanary(canary, { log }), [
    { source: "log", form: "json", at: '{"message":"value='.length },
  ]);
});

test("finds the component-encoded canary inside a URL", () => {
  const prefix = "/capture?value=";
  assert.deepEqual(sweepForCanary(canary, { request: prefix + encodeURIComponent(canary) }), [
    { source: "request", form: "url", at: prefix.length },
  ]);
});

for (const form of ["base64", "base64url"] as const) {
  test(`finds ${form} alone and in an encoded stream at byte alignments 0, 1 and 2`, () => {
    const encoded = Buffer.from(canary).toString(form);
    assert.deepEqual(sweepForCanary(canary, { encoded }), [{ source: "encoded", form, at: 0 }]);

    const marker = "payload=";
    for (const prefix of ["abc", "x", "xy"]) {
      const stream = Buffer.from(prefix + canary + "suffix").toString(form);
      assert.deepEqual(sweepForCanary(canary, { encoded: marker + stream }), [
        { source: "encoded", form, at: marker.length + Math.ceil(prefix.length * 8 / 6) },
      ]);
    }
  });
}

test("finds lowercase and uppercase hex", () => {
  const hex = Buffer.from(canary).toString("hex");
  assert.deepEqual(sweepForCanary(canary, { lower: `0x${hex}`, upper: `0x${hex.toUpperCase()}` }), [
    { source: "lower", form: "hex", at: 2 },
    { source: "upper", form: "hex", at: 2 },
  ]);
});

test("returns no hits for clean sources and the assertion passes", () => {
  const sources = { log: '{"status":"ok"}', output: "[secret hidden]" };
  assert.deepEqual(sweepForCanary(canary, sources), []);
  assert.doesNotThrow(() => assertNoCanary(canary, sources));
});

test("reports both source names and only match metadata", () => {
  const sources = { "model input": canary, bus: encodeURIComponent(canary) };
  const hits = sweepForCanary(canary, sources);
  assert.deepEqual(hits, [
    { source: "model input", form: "plain", at: 0 },
    { source: "bus", form: "url", at: 0 },
  ]);
  assert.ok(!JSON.stringify(hits).includes(canary), "hits must not contain the canary");
  assert.throws(() => assertNoCanary(canary, sources), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /model input.*plain/s);
    assert.match(error.message, /bus.*url/s);
    assert.ok(!error.message.includes(canary), "the error must not contain the canary");
    assert.ok(!error.message.includes(sources.bus), "the error must not contain the encoded canary");
    return true;
  });
});

test("withholds a source name that contains the canary", () => {
  const sources = { [`log ${canary}`]: canary };
  const hits = sweepForCanary(canary, sources);
  assert.equal(hits.length, 1);
  assert.ok(!hits[0].source.includes(canary), "the source name must not expose the canary");
  assert.throws(() => assertNoCanary(canary, sources), (error) => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(canary), "the error must not expose the canary in a source name");
    return true;
  });
});

test("searches identical encodings once", () => {
  const plain = ["fixture", "42"].join("-");
  assert.equal(canaryForms(plain).filter(({ needle }) => needle === plain).length, 1);
  assert.deepEqual(sweepForCanary(plain, { log: plain }), [{ source: "log", form: "plain", at: 0 }]);
  assert.deepEqual(sweepForCanary(plain, { log: Buffer.from(plain).toString("base64") }), [
    { source: "log", form: "base64", at: 0 },
  ]);
});

test("rejects a canary shorter than eight characters without revealing it", () => {
  const short = ["f", "ixture"].join("");
  for (const check of [canaryForms, sweepForCanary, assertNoCanary]) {
    assert.throws(() => check(short, {}), (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /8 characters/);
      assert.ok(!error.message.includes(short), "the error must not contain the short canary");
      return true;
    });
  }
});
