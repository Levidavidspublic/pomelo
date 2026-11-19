import assert from "node:assert/strict";
import test from "node:test";
import { checkDownload } from "../src/pomelo/browser/download-rule.js";

const input = {
  jobId: "Job_42-a",
  suggestedName: "report.pdf",
  sizeBytes: 500,
  pageOrigin: "https://example.test",
  maxBytes: 1_000,
};

test("a PDF at or below the size limit can be saved in its job folder", () => {
  const expected = {
    decision: "save",
    fileName: "report.pdf",
    relPath: "downloads/Job_42-a/report.pdf",
    reason: "ok",
  };
  assert.deepEqual(checkDownload(input), expected);
  assert.deepEqual(checkDownload({ ...input, sizeBytes: input.maxBytes }), expected);
});

test("download names lose path parts, controls, and unsafe punctuation", () => {
  const names = [
    ["../../etc/passwd", "passwd"],
    ["C:\\x\\a.txt", "a.txt"],
    ["C:a.txt", "a.txt"],
    ["a\u202E\u2066b\u0000\u0085.txt.  ", "ab.txt"],
    ["report..pdf", "report.pdf"],
    ["report.pdf:stream", "report.pdf"],
  ];
  for (const [suggestedName, fileName] of names) {
    const result = checkDownload({ ...input, suggestedName });
    assert.equal(result.fileName, fileName);
    assert.equal(result.relPath, `downloads/Job_42-a/${fileName}`);
    assert.doesNotMatch(result.relPath ?? "", /\.\.|\\/);
  }
});

test("Windows device names get a prefix and Hebrew letters are kept", () => {
  for (const name of ["CON.txt", "nul", "COM1.txt", "lpt².txt", "AUX .pdf"]) {
    assert.equal(checkDownload({ ...input, suggestedName: name }).fileName, `_${name}`);
  }
  assert.equal(checkDownload({ ...input, suggestedName: "? CON.txt" }).fileName, "_CON.txt");
  const hebrewName = "דוח.pdf";
  assert.equal(checkDownload({ ...input, suggestedName: hebrewName }).fileName, hebrewName);
});

test("names that clean to empty become download", () => {
  for (const suggestedName of ["", "../", ".. .", "\u202E\u0000"]) {
    assert.equal(checkDownload({ ...input, suggestedName }).fileName, "download");
  }
});

test("long names are capped at 120 characters and remain clean after clipping", () => {
  const longStem = "a".repeat(119);
  assert.equal(checkDownload({ ...input, suggestedName: `${longStem}.txt` }).fileName, longStem);
  assert.equal(checkDownload({ ...input, suggestedName: `${longStem}📄.pdf` }).fileName, longStem);
  assert.equal(checkDownload({ ...input, suggestedName: "a".repeat(121) }).fileName.length, 120);
});

test("programs and scripts are held even with disguised or clipped endings", () => {
  const extensions = ["exe", "msi", "bat", "cmd", "ps1", "sh", "scr", "dmg", "pkg", "app", "jar", "js", "vbs", "lnk"];
  const names = [
    ...extensions.map((extension) => `file.${extension}`),
    "a.pdf.exe", "run.ps1", "file.EXE. ", "file..exe", "file.exe:stream",
    `${"a".repeat(120)}.exe`, `${"a".repeat(116)}.exe.pdf`,
  ];
  for (const suggestedName of names) {
    const result = checkDownload({ ...input, suggestedName });
    assert.equal(result.decision, "hold", suggestedName);
    assert.equal(result.reason, "program-type", suggestedName);
    assert.equal(result.relPath, `downloads/Job_42-a/${result.fileName}`);
  }
});

test("oversized files and files without a known byte count are held", () => {
  assert.deepEqual(checkDownload({ ...input, sizeBytes: 1_001 }), {
    decision: "hold",
    fileName: "report.pdf",
    relPath: "downloads/Job_42-a/report.pdf",
    reason: "size-limit",
  });
  for (const sizeBytes of [undefined, null, NaN, Infinity, -1]) {
    const result = checkDownload({ ...input, sizeBytes });
    assert.equal(result.decision, "hold");
    assert.equal(result.reason, "size-unknown");
  }
});

test("invalid job IDs are refused without a destination", () => {
  for (const jobId of ["../elsewhere", "a/b", "a\\b", "a\n", "a b", "", ".", "א"]) {
    assert.deepEqual(checkDownload({ ...input, jobId }), {
      decision: "refuse",
      fileName: "report.pdf",
      relPath: null,
      reason: "bad-job-id",
    });
  }
});

test("the decision does not echo a page address", () => {
  const result = checkDownload({
    ...input,
    suggestedName: "run.ps1",
    pageOrigin: "https://example.test/sample-page?item=123#section",
  });
  assert.deepEqual(result, {
    decision: "hold",
    fileName: "run.ps1",
    relPath: "downloads/Job_42-a/run.ps1",
    reason: "program-type",
  });
});
