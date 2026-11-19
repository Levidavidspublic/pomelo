import assert from "node:assert/strict";
import test from "node:test";
import { paragraphDirections, textDirection } from "../src/client/pomelo/text-direction.js";

test("the first Hebrew, Arabic or Latin letter sets text direction", () => {
  assert.equal(textDirection("שלום לכולם"), "rtl");
  assert.equal(textDirection("Hello everyone"), "ltr");
  assert.equal(textDirection("مرحبا بالعالم"), "rtl");
  assert.equal(textDirection("## שלום world"), "rtl");
  assert.equal(textDirection("1. Hello שלום"), "ltr");
});

test("URLs and inline code spans do not set text direction", () => {
  assert.equal(textDirection("https://example.test/path שלום"), "rtl");
  assert.equal(textDirection("`const value = 1` שלום"), "rtl");
  assert.equal(textDirection("``code with a ` backtick`` שלום"), "rtl");
  assert.equal(textDirection("[שלום](https://example.test)"), "rtl");
});

test("text with no strong letter uses auto direction", () => {
  assert.equal(textDirection("123 ١٢٣ 👋 !? ׃"), "auto");
  assert.equal(textDirection(""), "auto");
  assert.equal(textDirection("`code` https://example.test"), "auto");
});

test("code blocks use ltr even with Hebrew comments", () => {
  assert.equal(textDirection("```\n// שלום\n```"), "ltr");
  assert.equal(textDirection("    // שלום"), "ltr");
});

test("each blank-line-separated paragraph keeps its own text and direction", () => {
  assert.deepEqual(paragraphDirections("Hello שלום\r\n \r\nשלום world"), [
    { text: "Hello שלום", dir: "ltr" },
    { text: "שלום world", dir: "rtl" },
  ]);
  assert.deepEqual(paragraphDirections("\n \n"), []);
});

test("a fence separates paragraphs and keeps blank lines and shorter fences inside it", () => {
  const code = "````js\n// שלום\n\n```\n// עולם\n````";

  assert.deepEqual(paragraphDirections(`שלום\n${code}\nשלום`), [
    { text: "שלום", dir: "rtl" },
    { text: code, dir: "ltr" },
    { text: "שלום", dir: "rtl" },
  ]);
  assert.deepEqual(paragraphDirections("~~~\n// שלום\n\n// עולם"), [
    { text: "~~~\n// שלום\n\n// עולם", dir: "ltr" },
  ]);
});
