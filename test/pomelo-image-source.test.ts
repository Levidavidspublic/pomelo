import assert from "node:assert/strict";
import test from "node:test";
import { checkImageSource, IMAGE_SOURCE_LIMITS } from "../src/client/pomelo/image-source.js";

function expectRefusal(src: unknown): void {
  const result = checkImageSource({ src });
  assert.equal(result.mode, "refuse");
  assert.ok(result.reason);
}

test("shows same-origin API paths and relative work-file paths", () => {
  for (const src of ["/api/sessions/x/work/file?path=out%2Fchart.png", "out/chart.png", "./out/my%20chart.png"]) {
    assert.deepEqual(checkImageSource({ src, alt: "  Sales chart  " }), {
      mode: "show", src, alt: "Sales chart",
    });
  }
});

test("shows inline images with supported media types", () => {
  for (const src of [
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/jpeg;base64,/9j/",
    "data:image/gif,GIF89a",
    "data:image/webp;base64,UklGRg==",
    "  DaTa:IMAGE/AVIF;base64,AAAA  ",
  ]) {
    assert.deepEqual(checkImageSource({ src }), { mode: "show", src: src.trim(), alt: "Image" });
  }
});

test("refuses an inline image above the source length cap", () => {
  const prefix = "data:image/png;base64,";
  const atLimit = prefix.padEnd(IMAGE_SOURCE_LIMITS.maxDataUrlChars, "A");
  assert.equal(checkImageSource({ src: atLimit }).mode, "show");
  expectRefusal(atLimit + "A");
});

test("offers HTTP and HTTPS images as links, including mixed-case schemes", () => {
  for (const [src, href] of [
    ["https://example.com/a.png", "https://example.com/a.png"],
    ["  HtTp://EXAMPLE.com/a.png  ", "http://example.com/a.png"],
  ]) {
    assert.deepEqual(checkImageSource({ src, alt: " Plot " }), {
      mode: "link", href, alt: "Plot", reason: "remote",
    });
  }
});

test("refuses unsafe schemes, protocol-relative addresses, and unsupported data types", () => {
  for (const src of [
    "//example.com/a.png",
    "  //example.com/a.png  ",
    "/\\example.com/a.png",
    "javascript:alert(1)",
    "  JaVaScRiPt:alert(1)  ",
    "  FiLe:///outside/chart.png",
    "blob:https://example.com/id",
    "data:text/html,%3Chtml%3E",
    "  DaTa:IMAGE/SVG+XML,%3Csvg%3E  ",
    "data:image/png-other;base64,AAAA",
    "data:image/png;base64",
    "data:image/png;base64,",
    "https://",
  ]) {
    expectRefusal(src);
  }
});

test("refuses control characters before trimming or parsing the source", () => {
  for (const src of ["\thttps://example.com/a.png", "java\nscript:alert(1)", "out/chart.png\r", "out/\0chart.png", "out/\x7fchart.png", "out/\x85chart.png"]) {
    expectRefusal(src);
  }
});

test("refuses missing sources and paths outside the allowed locations", () => {
  for (const src of [undefined, null, 42, "", "  ", "?path=chart.png", "/outside/chart.png", "../chart.png", "/api/%2e%2E/outside/chart.png", "out/%00chart.png"]) {
    expectRefusal(src);
  }
});

test("defaults missing or blank alt text and caps long alt text", () => {
  const src = "out/chart.png";
  assert.deepEqual(checkImageSource({ src }), { mode: "show", src, alt: "Image" });
  assert.deepEqual(checkImageSource({ src, alt: "   " }), { mode: "show", src, alt: "Image" });
  const alt = "a".repeat(IMAGE_SOURCE_LIMITS.maxAltChars);
  assert.deepEqual(checkImageSource({ src, alt: `  ${alt}more  ` }), { mode: "show", src, alt });
});
