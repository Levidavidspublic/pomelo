import assert from "node:assert/strict";
import test from "node:test";
import { checkImageBytes } from "../src/pomelo/image-bytes.js";

const encode = (value: string) => new TextEncoder().encode(value);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
const gif87a = encode("GIF87a");
const gif89a = encode("GIF89a");
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

function expectRefusal(bytes: Uint8Array, declaredType?: string, limits?: { maxBytes: number }): string {
  const result = checkImageBytes(bytes, declaredType, limits);
  assert.equal(result.ok, false);
  assert.equal(result.kind, null);
  assert.equal(result.contentType, null);
  assert.ok(result.reason);
  return result.reason;
}

test("accepts the four raster formats by signature and returns their content types", () => {
  for (const [bytes, kind, contentType] of [
    [png, "png", "image/png"],
    [jpeg, "jpeg", "image/jpeg"],
    [gif87a, "gif", "image/gif"],
    [gif89a, "gif", "image/gif"],
    [webp, "webp", "image/webp"],
  ] as const) {
    assert.deepEqual(checkImageBytes(bytes), { ok: true, kind, contentType, reason: null });
  }
});

test("refuses non-WebP RIFF files, incomplete signatures and unknown formats", () => {
  expectRefusal(encode("RIFF....WAVE"), "image/webp");
  expectRefusal(encode("JUNK....WEBP"));
  for (const bytes of [png, jpeg, gif87a, gif89a, webp]) {
    expectRefusal(bytes.subarray(0, bytes.length - 1));
  }
  expectRefusal(encode("plain text"), "image/png");
});

test("refuses SVG, HTML and other markup even with a declared image type", () => {
  for (const markup of [
    "<svg><script></script></svg>",
    "<!doctype html><html></html>",
    "<example>",
    "\uFEFF<svg></svg>",
    " \t\r\n<html></html>",
    "\uFEFF  <svg></svg>",
  ]) {
    expectRefusal(encode(markup), "image/png");
  }
});

test("refuses an empty buffer", () => {
  expectRefusal(new Uint8Array());
});

test("accepts a matching declared media type and refuses a mismatch", () => {
  assert.deepEqual(checkImageBytes(png, " IMAGE/PNG "), {
    ok: true, kind: "png", contentType: "image/png", reason: null,
  });
  expectRefusal(png, "image/jpeg");
  expectRefusal(png, "");
});

test("accepts exactly 10 MiB and refuses one byte more by default", () => {
  const limit = 10 * 1024 * 1024;
  const bytes = new Uint8Array(limit + 1);
  bytes.set(png);
  assert.equal(checkImageBytes(bytes.subarray(0, limit)).ok, true);
  expectRefusal(bytes);
});

test("honors a custom byte limit and refuses an invalid limit", () => {
  assert.equal(checkImageBytes(png, undefined, { maxBytes: png.length }).ok, true);
  expectRefusal(png, undefined, { maxBytes: png.length - 1 });
  for (const maxBytes of [NaN, Infinity, -1, 8.5]) {
    expectRefusal(png, undefined, { maxBytes });
  }
});

test("refusal reasons never echo body bytes or the declared type", () => {
  const sample = "sample-marker-82";
  const firstReason = expectRefusal(encode(sample));
  assert.equal(firstReason, expectRefusal(encode("different-sample")));
  for (const reason of [firstReason, expectRefusal(encode(`<${sample}>`)), expectRefusal(png, sample)]) {
    assert.ok(!reason.includes(sample));
  }
});
