import assert from "node:assert/strict";
import test from "node:test";
import { lineEndingCheck } from "../src/pomelo/line-endings.js";

const clean = { ok: true, problems: [] };
const encoder = new TextEncoder();

function file(path: string, content: string) {
  return { path, bytes: encoder.encode(content) };
}

test("accepts LF, Hebrew UTF-8, and a file without a final newline", () => {
  assert.deepEqual(lineEndingCheck([
    file("docs/example.md", "first\nsecond\n"),
    file("docs/hebrew.md", "שלום\nעולם"),
  ]), clean);
});

test("names a CRLF file at its first Windows line ending", () => {
  const path = "docs/windows.md";
  assert.deepEqual(lineEndingCheck([{ ...file(path, "first\r\nsecond\r\n"), status: "added" }]), {
    ok: false,
    problems: [{ path, reason: "crlf", line: 1, message: "This file uses Windows (CRLF) line endings." }],
  });
});

test("names mixed line endings at the first CRLF line", () => {
  const path = "docs/mixed.md";
  assert.deepEqual(lineEndingCheck([{ ...file(path, "first\nsecond\r\nthird\r\n"), status: "modified" }]), {
    ok: false,
    problems: [{ path, reason: "mixed", line: 2, message: "This file mixes Windows (CRLF) and LF line endings." }],
  });
  assert.equal(lineEndingCheck([file(path, "first\r\nsecond\n")]).problems[0]?.reason, "mixed");
});

test("reports a UTF-8 byte-order mark only at the start", () => {
  const path = "docs/marked.md";
  assert.deepEqual(lineEndingCheck([
    { path, bytes: Uint8Array.of(0xef, 0xbb, 0xbf, 0x61, 0x0a) },
    file("docs/embedded.md", "a\ufeffb\n"),
  ]), {
    ok: false,
    problems: [{ path, reason: "bom", line: 1, message: "This file starts with a UTF-8 byte-order mark." }],
  });
});

test("reports the first line with invalid UTF-8, including a truncated sequence at EOF", () => {
  const path = "docs/invalid.md";
  const message = "This file contains invalid UTF-8.";
  assert.deepEqual(lineEndingCheck([
    { path, bytes: Uint8Array.of(0x61, 0x0a, 0xc3, 0x28, 0x0a, 0xff) },
  ]), { ok: false, problems: [{ path, reason: "not-utf8", line: 2, message }] });
  assert.deepEqual(lineEndingCheck([
    { path, bytes: Uint8Array.of(0x61, 0x0a, 0xe2, 0x82) },
  ]), { ok: false, problems: [{ path, reason: "not-utf8", line: 2, message }] });
});

test("skips binary files by extension or by a NUL byte", () => {
  assert.deepEqual(lineEndingCheck([
    file("assets/example.png", "a\r\n"),
    { path: "assets/example.PNG", bytes: Uint8Array.of(0xff) },
    { path: "docs/binary.txt", bytes: Uint8Array.of(0xff, 0x00, 0x0d, 0x0a) },
  ]), clean);
});

test("skips deleted files even if old bytes are supplied", () => {
  assert.deepEqual(lineEndingCheck([
    { path: "docs/deleted.md", status: "deleted" },
    { ...file("docs/old.md", "a\r\n"), status: "deleted" },
  ]), clean);
});

test("reports each problem at its first line, sorted by path and line", () => {
  const path = "docs/a.md";
  const result = lineEndingCheck([
    file("docs/z.md", "z\r\n"),
    { path, bytes: Uint8Array.of(...encoder.encode("\ufefffirst\n"), 0xff, ...encoder.encode("\nthird\r\n")) },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map(({ path, reason, line }) => ({ path, reason, line })), [
    { path, reason: "bom", line: 1 },
    { path, reason: "not-utf8", line: 2 },
    { path, reason: "mixed", line: 3 },
    { path: "docs/z.md", reason: "crlf", line: 1 },
  ]);
});

test("accepts an empty change list and an empty file", () => {
  assert.deepEqual(lineEndingCheck([]), clean);
  assert.deepEqual(lineEndingCheck([file("docs/empty.md", "")]), clean);
});
