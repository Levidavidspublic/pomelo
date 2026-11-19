import assert from "node:assert/strict";
import test from "node:test";
import { storedStep, type RawStep } from "../src/pomelo/browser/step-log.js";
import { MASK } from "../src/pomelo/mask.js";
import { HIDDEN } from "../src/secrets.js";

const canary = "CANARY-pomelo-7f3a91";
const known = Object.freeze([canary]);

test("stored steps mask the known canary in the action, target, value and note", () => {
  // Exercise a runtime action string outside the declared kind union.
  assert.equal(storedStep({ kind: canary as RawStep["kind"], target: "button" }, known), `${MASK} button`);
  assert.equal(storedStep({ kind: "click", target: `button ${canary}` }, known), `click button ${MASK}`);
  assert.equal(storedStep({ kind: "type", value: canary }, known), `type ${MASK}`);
  assert.equal(storedStep({ kind: "read", note: `found ${canary}` }, known), `read found ${MASK}`);
});

test("Friday's shield hides a key-shaped fixture absent from the known values", () => {
  const fakeKey = `sk-${"fake-fixture-0".repeat(3)}`;
  assert.equal(storedStep({ kind: "read", note: `found ${fakeKey}` }, known), `read found sk-…${HIDDEN}`);
});

test("a fill value always reads as the mask, even with no known values", () => {
  assert.equal(storedStep({ kind: "fill", target: "search", value: "fake fixture", note: "done" }, []), `fill search ${MASK} done`);
});

test("stored steps are one line and mask multiline values before flattening", () => {
  const multilineCanary = `${canary}\r\nfixture`;
  assert.equal(
    storedStep({ kind: "read", target: "first\r\nsecond", note: `${multilineCanary}\nthird\u2028fourth\u2029fifth` }, [multilineCanary]),
    `read first second ${MASK} third fourth fifth`,
  );
});

test("stored steps cap the masked text at 500 characters including the ellipsis", () => {
  const exact = "x".repeat(495);
  assert.equal(storedStep({ kind: "read", target: exact }, known), `read ${exact}`);

  const target = "x".repeat(489);
  const result = storedStep({ kind: "read", target, note: `${canary} extra text` }, known);
  assert.equal(result, `read ${target} ${MASK}…`);
  assert.equal(result.length, 500);
});

test("non-string fields are ignored without coercion", () => {
  const target = { toString() { throw new Error("Unexpected coercion"); } };
  assert.equal(storedStep({ kind: "other", target, value: Symbol(canary), note: 42 }, known), "other");
});

test("the serialized log of 20 mixed steps contains zero canary hits", () => {
  const fixtures: RawStep[] = [
    { kind: "open", target: `https://example.invalid/?q=${canary}` },
    { kind: "click", target: "button", note: canary },
    { kind: "type", target: "search", value: canary },
    { kind: "fill", target: "search", value: canary },
    { kind: "read", note: `found ${canary}`, value: { text: canary } },
  ];
  const steps = Array.from({ length: 20 }, (_, index) => storedStep(fixtures[index % fixtures.length], known));
  assert.ok(!JSON.stringify(steps).includes(canary));
});
