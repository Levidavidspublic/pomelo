import assert from "node:assert/strict";
import test from "node:test";
import { maskRegions, type FieldBox } from "../src/pomelo/mask-regions.js";

const viewport = { width: 100, height: 80 };
const box = { x: 10, y: 20, width: 30, height: 10 };

test("masks password fields with two pixels of padding", () => {
  assert.deepEqual(maskRegions([{ ...box, type: "password" }], viewport), [
    { x: 8, y: 18, width: 34, height: 14 },
  ]);
});

test("uses Friday's secret autocomplete and name rules", () => {
  const fields = [
    { ...box, type: "text", autocomplete: "section-login one-time-code" },
    { ...box, x: 50, type: "text", name: "cvv" },
  ];
  assert.deepEqual(maskRegions(fields, viewport, 0), [box, { ...box, x: 50 }]);
});

test("leaves plain text visible and masks broker-filled text", () => {
  const fields = [
    { ...box, type: "text", filledByBroker: false },
    { ...box, x: 50, type: "text", filledByBroker: true },
  ];
  assert.deepEqual(maskRegions(fields, viewport), [
    { x: 48, y: 18, width: 34, height: 14 },
  ]);
});

test("rounds padded edges outward and clips partially visible fields", () => {
  const fields = [
    { ...box, x: -15, y: 20.75, type: "password" },
    { ...box, x: 85, y: 75, type: "password" },
  ];
  assert.deepEqual(maskRegions(fields, viewport, 1.25), [
    { x: 0, y: 19, width: 17, height: 13 },
    { x: 83, y: 73, width: 17, height: 7 },
  ]);
});

test("skips empty, off-screen and non-finite field boxes", () => {
  const secret = { ...box, type: "password" };
  const fields = [
    { ...secret, width: 0 },
    { ...secret, height: 0 },
    { ...secret, width: -1 },
    { ...secret, x: -box.width },
    { ...secret, y: viewport.height },
    { ...secret, x: NaN },
    { ...secret, y: Infinity },
    { ...secret, width: Infinity },
    { ...secret, height: NaN },
  ];
  assert.deepEqual(maskRegions(fields, viewport), []);
});

test("returns no regions for an empty list", () => {
  assert.deepEqual(maskRegions([], viewport), []);
});

test("leaves the input array and its field boxes unchanged", () => {
  const fields: FieldBox[] = [
    { ...box, type: "password" },
    { ...box, type: "text" },
  ];
  const original = fields.map((field) => ({ ...field }));
  fields.forEach(Object.freeze);
  Object.freeze(fields);

  assert.deepEqual(maskRegions(fields, viewport, 0), [box]);
  assert.deepEqual(fields, original);
});
