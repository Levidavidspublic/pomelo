import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { makeIcon } from "../scripts/pomelo/make-icon.mjs";

const iconUrl = new URL("../packaging/pomelo/icon.png", import.meta.url);

test("the Pomelo icon is a 1024 × 1024 RGBA PNG", () => {
  const icon = readFileSync(iconUrl);
  assert.deepEqual(icon.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"));
  assert.equal(icon.readUInt32BE(8), 13);
  assert.equal(icon.toString("ascii", 12, 16), "IHDR");
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
  assert.equal(icon[24], 8);
  assert.equal(icon[25], 6);
});

test("regenerating the Pomelo icon produces the same bytes", () => {
  const icon = readFileSync(iconUrl);
  assert.ok(makeIcon().equals(icon), "Regenerate with node --import tsx scripts/pomelo/make-icon.mts");
});
