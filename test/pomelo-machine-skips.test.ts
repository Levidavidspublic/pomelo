import assert from "node:assert/strict";
import test from "node:test";
import { findMachineSkips } from "../src/pomelo/machine-skips.js";

const path = "test/pomelo-example.test.ts";

test("reports machine-dependent guards by path, added line, and kind", () => {
  assert.deepEqual(findMachineSkips([{
    path,
    addedLines: [
      { line: 3, text: 'if (process.platform === "win32") return;' },
      { line: 7, text: "if (process.env.CI) return" },
      { line: 8, text: "if (!process.env.FRIDAY_HOME) return" },
      { line: 12, text: 'if (os.arch() !== "x64") return' },
      { line: 15, text: 'if (process.arch !== "arm64") { return; }' },
      { line: 19, text: 'if (os.platform() === "darwin") return;' },
      { line: 20, text: 'if (process.env["CI"] || process.env.CI) return;' },
    ],
  }]), {
    ok: false,
    findings: [
      { path, line: 3, kind: "platform" },
      { path, line: 7, kind: "ci" },
      { path, line: 8, kind: "env" },
      { path, line: 12, kind: "arch" },
      { path, line: 15, kind: "arch" },
      { path, line: 19, kind: "platform" },
      { path, line: 20, kind: "ci" },
    ],
  });
});

test("reports short circuits, ternaries, and conditions split across added lines", () => {
  assert.deepEqual(findMachineSkips([{
    path,
    addedLines: [
      { line: 3, text: 'process.platform === "linux" && assert.equal(a, b);' },
      { line: 5, text: 'process.arch === "x64" ? assert.equal(a, b) : undefined;' },
      { line: 7, text: "process.env.CI || verify();" },
      { line: 10, text: "if (" },
      { line: 11, text: "  process.env.SAMPLE &&" },
      { line: 12, text: '  process.platform === "win32"' },
      { line: 13, text: ") {" },
      { line: 14, text: "  return;" },
      { line: 15, text: "}" },
      { line: 17, text: "if (ready ? process.arch : fallback) return;" },
      { line: 18, text: "Number(process.env.SAMPLE) >= 2 && verify();" },
      { line: 19, text: 'if (process.env.SAMPLE || "fallback") return;' },
    ],
  }]), {
    ok: false,
    findings: [
      { path, line: 3, kind: "platform" },
      { path, line: 5, kind: "arch" },
      { path, line: 7, kind: "ci" },
      { path, line: 11, kind: "env" },
      { path, line: 12, kind: "platform" },
      { path, line: 17, kind: "arch" },
      { path, line: 18, kind: "env" },
      { path, line: 19, kind: "env" },
    ],
  });
});

test("ignores comments and string literals while still checking code after them", () => {
  assert.deepEqual(findMachineSkips([{
    path,
    addedLines: [
      { line: 2, text: '// if (process.platform === "win32") return;' },
      { line: 3, text: "/* if (process.env.CI) return; */" },
      { line: 4, text: "/*" },
      { line: 5, text: "if (!process.env.FRIDAY_HOME) return;" },
      { line: 6, text: '*/ const sample = \'if (os.arch() !== "x64") return;\';' },
      { line: 7, text: 'const sampleTwo = "process.platform && verify();";' },
      { line: 8, text: "const sampleThree = `" },
      { line: 9, text: "if (process.env.CI) return;" },
      { line: 10, text: "`;" },
      { line: 11, text: '/* example */ if (process.platform === "win32") return;' },
      { line: 12, text: "/*" },
      { line: 17, text: "if (process.env.CI) return;" },
      { line: 20, text: "*/ if (process.env.CI) return;" },
      { line: 21, text: 'const rendered = `example ${`if (process.arch) return;`} // literal`;' },
      { line: 22, text: 'const renderedCheck = `example ${process.arch === "arm64" ? verify() : ""}`;' },
      { line: 23, text: "const template = `" },
      { line: 25, text: "if (process.arch) return;" },
    ],
  }]), {
    ok: false,
    findings: [
      { path, line: 11, kind: "platform" },
      { path, line: 17, kind: "ci" },
      { path, line: 20, kind: "ci" },
      { path, line: 22, kind: "arch" },
      { path, line: 25, kind: "arch" },
    ],
  });
});

test("keeps lexical state within each file and expression context within contiguous additions", () => {
  const otherPath = "test/pomelo-other.test.ts";
  assert.deepEqual(findMachineSkips([{
    path,
    addedLines: [
      { line: 3, text: "const arch = process.arch" },
      { line: 4, text: "ready && verify();" },
      { line: 5, text: "assert.equal(process.arch, ready && verify());" },
      { line: 6, text: "if (" },
      { line: 8, text: "assert.equal(process.arch, expected);" },
      { line: 9, text: "/*" },
    ],
  }, {
    path: otherPath,
    addedLines: [{ line: 1, text: 'if (process /* comment */ . env ["CI"]) return;' }],
  }]), { ok: false, findings: [{ path: otherPath, line: 1, kind: "ci" }] });
});

test("ignores machine values used outside the controlling side of a condition", () => {
  assert.deepEqual(findMachineSkips([{
    path,
    addedLines: [
      { line: 1, text: 'assert.equal(process.platform, "linux");' },
      { line: 2, text: "const ci = process.env.CI; if (ready) return;" },
      { line: 3, text: "if (ready) return process.arch;" },
      { line: 4, text: "const result = ready && process.arch;" },
      { line: 5, text: "const value = ready ? process.env.SAMPLE : undefined;" },
      { line: 6, text: "if (ready) { assert.equal(process.arch, expected); }" },
      { line: 7, text: "ready && verify();" },
      { line: 8, text: 'const dir = process.env.TMPDIR || "/tmp";' },
      { line: 9, text: "const limit = process.env.SAMPLE || 1" },
      { line: 10, text: "const options = { enabled: process.env.CI || false };" },
    ],
  }]), { ok: true, findings: [] });
});

test("only checks Pomelo test files and tolerates malformed input", () => {
  const addedLines = [{ line: 4, text: "if (process.env.CI) return" }];
  for (const input of [undefined, null, true, {}, "test", [], [
    { path: "src/pomelo/x.ts", addedLines },
    { path: "test/unread.test.ts", addedLines },
    { path: "test/nested/pomelo-example.test.ts", addedLines },
    { path: "test/pomelo-example.ts", addedLines },
    null,
    { path, addedLines: "if (process.env.CI) return" },
    { path, addedLines: [null, { line: 0, text: addedLines[0].text }, { line: 5, text: 123 }] },
  ]]) {
    assert.deepEqual(findMachineSkips(input), { ok: true, findings: [] });
  }
});
