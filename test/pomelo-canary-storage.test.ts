import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { scanHomeForCanary } from "../src/pomelo/canary-storage.js";

const canary = 'CANARY-pomelo-test-0001"/+?';
const json = JSON.stringify(canary).slice(1, -1);
const url = encodeURIComponent(canary);
const base64 = Buffer.from(canary).toString("base64");
const hex = Buffer.from(canary).toString("hex");

function tempHome(t: TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pomelo-canary-storage-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("counts clean text files throughout the home", (t) => {
  const home = tempHome(t);
  mkdirSync(path.join(home, "logs"));
  writeFileSync(path.join(home, "data.json"), "[]\n");
  writeFileSync(path.join(home, "logs", "abc.jsonl"), '{"status":"ok"}\n');
  writeFileSync(path.join(home, "notes"), "");

  assert.deepEqual(scanHomeForCanary(home, canary), { filesScanned: 3, skipped: [], hits: [] });
});

test("reports the plain canary in data.json once per line", (t) => {
  const home = tempHome(t);
  const plain = "CANARY-pomelo-test-0001";
  writeFileSync(path.join(home, "data.json"), `[\n${JSON.stringify({ first: plain, second: plain })}\n]\n`);

  assert.deepEqual(scanHomeForCanary(home, plain).hits, [{ file: "data.json", line: 2, form: "plain" }]);
});

test("reports a base64 canary on line three of a JSONL log", (t) => {
  const home = tempHome(t);
  const log = path.join("logs", "abc.jsonl");
  mkdirSync(path.join(home, "logs"));
  writeFileSync(path.join(home, log), `{}\r\n{}\r\n"${base64}"\r\n`);

  assert.deepEqual(scanHomeForCanary(home, canary).hits, [{ file: log, line: 3, form: "base64" }]);
});

test("reports all five forms without including any of their values in the result", (t) => {
  const home = tempHome(t);
  writeFileSync(path.join(home, "notes.txt"), [canary, json, url, base64, hex, hex.toUpperCase()].join("\n"));

  const result = scanHomeForCanary(home, canary);
  assert.deepEqual(result.hits, ["plain", "json", "url", "base64", "hex", "hex"].map((form, index) => ({
    file: "notes.txt",
    line: index + 1,
    form,
  })));
  for (const value of [canary, json, url, base64, hex, hex.toUpperCase()]) {
    assert.ok(!JSON.stringify(result).includes(value), "result must contain only match metadata");
  }
});

test("skips oversized files and scans files at the byte limit", (t) => {
  const home = tempHome(t);
  writeFileSync(path.join(home, "large.txt"), "ééé");
  writeFileSync(path.join(home, "small.txt"), "éé");

  assert.deepEqual(scanHomeForCanary(home, canary, { maxBytes: 4 }), {
    filesScanned: 1,
    skipped: [{ file: "large.txt", reason: "too-large" }],
    hits: [],
  });
});

test("skips files containing NUL bytes or invalid UTF-8", (t) => {
  const home = tempHome(t);
  writeFileSync(path.join(home, "nul.bin"), Buffer.from(`${canary}\0`));
  writeFileSync(path.join(home, "invalid.bin"), Buffer.from([0xff, 0xfe]));

  assert.deepEqual(scanHomeForCanary(home, canary), {
    filesScanned: 0,
    skipped: [{ file: "invalid.bin", reason: "binary" }, { file: "nul.bin", reason: "binary" }],
    hits: [],
  });
});

test("does not follow symlinks to files or directories outside the scanned home", (t) => {
  const root = tempHome(t);
  const home = path.join(root, "home");
  const outside = path.join(root, "outside");
  const outsideFile = path.join(outside, "notes.txt");
  mkdirSync(home);
  mkdirSync(outside);
  writeFileSync(outsideFile, canary);
  symlinkSync(outsideFile, path.join(home, "file-link"), "file");
  symlinkSync(outside, path.join(home, "dir-link"), "junction");

  assert.deepEqual(scanHomeForCanary(home, canary), {
    filesScanned: 0,
    skipped: [{ file: "dir-link", reason: "symlink" }, { file: "file-link", reason: "symlink" }],
    hits: [],
  });
  assert.deepEqual(scanHomeForCanary(path.join(home, "dir-link"), canary), {
    filesScanned: 0,
    skipped: [{ file: ".", reason: "symlink" }],
    hits: [],
  });
});

test("reports a missing home without throwing", (t) => {
  const home = path.join(tempHome(t), "missing");

  assert.deepEqual(scanHomeForCanary(home, canary), {
    filesScanned: 0,
    skipped: [{ file: ".", reason: "missing" }],
    hits: [],
  });
});

test("uses the forms returned by a custom matcher", (t) => {
  const home = tempHome(t);
  writeFileSync(path.join(home, "notes.txt"), `header\n${canary}\n`);
  const calls: string[] = [];

  const result = scanHomeForCanary(home, canary, {
    find(text, value) {
      assert.ok(value === canary, "the matcher receives the requested canary");
      calls.push(text === canary ? "match" : text);
      return text === canary ? ["custom", "wrapped"] : [];
    },
  });

  assert.deepEqual(calls, ["header", "match"]);
  assert.deepEqual(result.hits, [
    { file: "notes.txt", line: 2, form: "custom" },
    { file: "notes.txt", line: 2, form: "wrapped" },
  ]);
});

test("withholds paths and custom form labels that contain a canary form", (t) => {
  const home = tempHome(t);
  writeFileSync(path.join(home, `${url}.txt`), canary);
  writeFileSync(path.join(home, `${hex}.bin`), Buffer.from([0]));

  const result = scanHomeForCanary(home, canary, { find: () => [base64] });

  assert.deepEqual(result.hits, [{ file: "…", line: 1, form: "…" }]);
  assert.deepEqual(result.skipped, [{ file: "…", reason: "binary" }]);
});

test("a matcher error cannot expose the input in a diagnostic", (t) => {
  const home = tempHome(t);
  writeFileSync(path.join(home, "notes.txt"), canary);

  assert.throws(() => scanHomeForCanary(home, canary, {
    find(text) { throw new Error(text); },
  }), { message: "Canary storage matcher failed" });
});
