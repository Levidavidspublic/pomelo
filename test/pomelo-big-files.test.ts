import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_LIMITS, findBigFiles, type ChangedFile } from "../src/pomelo/big-files.js";

const KB = 1024;
const MB = 1024 * KB;

function file(path: string, changes: Partial<ChangedFile> = {}): ChangedFile {
  return { path, status: "added", bytes: 2 * KB, binary: false, ...changes };
}

test("small files and files at the default text limit pass", () => {
  assert.deepEqual(DEFAULT_LIMITS, { textBytes: 200 * KB, binaryBytes: 0 });
  assert.deepEqual(findBigFiles([
    file("src/pomelo/small.ts"),
    file("src/pomelo/at-limit.ts", { bytes: 200 * KB }),
    file("public/icon.png", { binary: true }),
  ]), { ok: true, findings: [] });
});

test("names oversized additions and modifications in path order", () => {
  const bytes = 300 * KB;
  assert.deepEqual(findBigFiles([
    file("src/pomelo/z.ts", { bytes }),
    file("docs/a.md", { status: "modified", bytes }),
  ]), {
    ok: false,
    findings: [
      { path: "docs/a.md", reason: "too-large", bytes },
      { path: "src/pomelo/z.ts", reason: "too-large", bytes },
    ],
  });
});

test("names binary changes under Pomelo source and test folders", () => {
  const paths = ["src/client/pomelo/view.dat", "src/pomelo/data.dat", "test/fixtures/data.dat"];
  assert.deepEqual(findBigFiles(paths.map((path) => file(path, { status: "modified", binary: true }))), {
    ok: false,
    findings: paths.map((path) => ({ path, reason: "binary", bytes: 2 * KB })),
  });
  assert.deepEqual(findBigFiles([file("test/empty.dat", { binary: true, bytes: 0 })]).findings, [
    { path: "test/empty.dat", reason: "binary", bytes: 0 },
  ]);
});

test("names added build and media files regardless of extension case", () => {
  const paths = ["x.DB", "x.dmg", "x.exe", "x.map", "x.min.js", "x.mov", "x.mp4", "x.node", "x.sqlite", "x.tgz", "x.zip"];
  assert.deepEqual(findBigFiles(paths.map((path) => file(path))), {
    ok: false,
    findings: paths.map((path) => ({ path, reason: "build-or-media", bytes: 2 * KB })),
  });
});

test("normalizes Windows paths and reports the first matching reason", () => {
  const bytes = 300 * KB;
  const files = [
    file("artifacts/x.mp4", { bytes }),
    file("browser/Cookies"),
    file("browser/Login Data"),
    file("src/pomelo/profiles/x.sqlite", { binary: true, bytes }),
    file("src/pomelo/x.MP4", { binary: true, bytes }),
    file("x.MAP", { bytes }),
  ];
  const result = {
    ok: false,
    findings: [
      { path: "artifacts/x.mp4", reason: "profile-data", bytes },
      { path: "browser/Cookies", reason: "profile-data", bytes: 2 * KB },
      { path: "browser/Login Data", reason: "profile-data", bytes: 2 * KB },
      { path: "src/pomelo/profiles/x.sqlite", reason: "profile-data", bytes },
      { path: "src/pomelo/x.MP4", reason: "binary", bytes },
      { path: "x.MAP", reason: "build-or-media", bytes },
    ],
  };
  assert.deepEqual(findBigFiles(files), result);
  assert.deepEqual(findBigFiles(files.map((entry) => ({ ...entry, path: entry.path.replaceAll("/", "\\") }))), result);
});

test("checks profile and build paths only on additions and ignores deleted and renamed files", () => {
  assert.deepEqual(findBigFiles([
    file("test/profiles/x.sqlite", { status: "deleted", bytes: 5 * MB, binary: true }),
    file("x.mp4", { status: "renamed", bytes: 5 * MB, binary: true }),
    file("profiles/x.map", { status: "modified" }),
    file("profiles-guide/Cookies.md"),
    file("artifacts.md"),
    file("x.mp4.ts"),
  ]), { ok: true, findings: [] });
});

test("accepts caller limits up to 1 MB and clamps both limits above it", () => {
  const files = [
    file("test/at-limit.dat", { bytes: MB, binary: true }),
    file("test/over-limit.dat", { bytes: MB + 1, binary: true }),
    file("src/pomelo/at-limit.ts", { bytes: MB }),
    file("src/pomelo/over-limit.ts", { bytes: MB + 1 }),
  ];
  assert.deepEqual(findBigFiles(files, { textBytes: 5 * MB, binaryBytes: 5 * MB }), {
    ok: false,
    findings: [
      { path: "src/pomelo/over-limit.ts", reason: "too-large", bytes: MB + 1 },
      { path: "test/over-limit.dat", reason: "binary", bytes: MB + 1 },
    ],
  });
  assert.deepEqual(findBigFiles([file("x.ts")], { textBytes: KB }).findings, [
    { path: "x.ts", reason: "too-large", bytes: 2 * KB },
  ]);
});

test("malformed input fails closed with a single bad-input finding", () => {
  const badInput = { ok: false, findings: [{ path: "", reason: "bad-input", bytes: 0 }] };
  for (const files of [null, {}, "x.ts", [null], [,], [{ ...file("x.ts"), status: "unknown" }],
    [file("x.map"), file("x.ts", { bytes: -1 })], [file("")], [{ path: "x.ts", status: "added", bytes: 1 }]]) {
    assert.deepEqual(findBigFiles(files), badInput);
  }
  assert.deepEqual(findBigFiles([], { textBytes: NaN }), badInput);
  assert.deepEqual(findBigFiles([], { binaryBytes: -1 }), badInput);
});
