import assert from "node:assert/strict";
import test from "node:test";
import { testTimeouts } from "../src/pomelo/test-timeouts.js";

const file = "test/pomelo-example.test.ts";
const clean = { ok: true, findings: [] };

function additions(lines: string[], path = file) {
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

test("reports timeouts above 30 seconds, including numeric separators and products", () => {
  const result = testTimeouts(additions([
    'test("slow", { timeout: 600000 }, run);',
    'test("at the cap", { timeout: 30_000 }, run);',
    'test("under the cap", { timeout: 1000 }, run);',
    'test("separators", { timeout: 60_000 }, run);',
    'test("product", { timeout: 10 * 60 * 1000 }, run);',
    'test("small product", { timeout: 30 * 1000 }, run);',
  ]));
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ file, line, kind }) => ({ file, line, kind })), [
    { file, line: 1, kind: "over-cap" },
    { file, line: 4, kind: "over-cap" },
    { file, line: 5, kind: "over-cap" },
  ]);
  assert.match(result.findings[0].reason, /600000.*30000/);
});

test("reports disabled timeouts and runner flags", () => {
  const result = testTimeouts(additions([
    'test("zero", { timeout: 0 }, run);',
    'test("infinite", { timeout: Infinity }, run);',
    'test("maximum", { "timeout": Number.MAX_SAFE_INTEGER }, run);',
    'execSync("node --test --test-timeout=0");',
    'spawnSync("node", ["--test", "--test-timeout", "600000"]);',
    'execSync(`node --test',
    "  '--test-timeout=0'`);",
  ]));
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ line, kind }) => [line, kind]), [
    [1, "disabled"],
    [2, "disabled"],
    [3, "disabled"],
    [4, "flag"],
    [5, "flag"],
    [7, "flag"],
  ]);
});

test("names values it cannot evaluate for review", () => {
  const result = testTimeouts(additions([
    'test("variable", { timeout: limit }, run);',
    'test("call", { timeout: getLimit(10, 20) }, run);',
    'test("mixed product", { timeout: 10 * limit }, run);',
    'test("other arithmetic", { timeout: 30000 + 1 }, run);',
  ]));
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ line, kind }) => [line, kind]), [
    [1, "unclear"], [2, "unclear"], [3, "unclear"], [4, "unclear"],
  ]);
});

test("ignores removed and context lines, comments, literals and Friday tests", () => {
  const diff = [
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,5 +1,12 @@",
    ' test("existing", { timeout: 600000 }, run);',
    '-test("removed", { timeout: Infinity }, run);',
    '+test("short", { timeout: 500 }, run);',
    '+// test("commented", { timeout: Infinity }, run);',
    ' /* an existing comment',
    '+  timeout: 600000,',
    '+  execSync("node --test --test-timeout=0");',
    ' */',
    '+const example = "{ timeout: 600000 }";',
    '+const prose = "The --test-timeout option applies to the runner.";',
    '+const pattern = /\\{ timeout: 600000 \\}/;',
    '+/* timeout: Infinity */',
    ' test("continues", run);',
    "",
  ].join("\n");
  const fridayDiff = additions(['test("Friday", { timeout: 600000 }, run);'], "test/big-search.test.ts");
  assert.deepEqual(testTimeouts(diff + fridayDiff), clean);
});

test("uses the custom cap and the new-file line numbers in each hunk", () => {
  const diff = [
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -5,2 +5,3 @@ first hunk",
    ' test("existing", run);',
    '-test("old", run);',
    '+test("at the custom cap", { timeout: 500 }, run);',
    '+test("first finding", { timeout: 501 }, run);',
    "@@ -30 +31 @@ second hunk",
    '-test("old", run);',
    '+test("second finding", { timeout: 502 }, run);',
  ].join("\r\n");
  assert.deepEqual(testTimeouts(diff), clean);
  const result = testTimeouts(diff, { maxTimeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ file, line }) => ({ file, line })), [
    { file, line: 7 }, { file, line: 31 },
  ]);
});

test("reports a changed value when the timeout key is context", () => {
  const diff = [
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -10,3 +10,5 @@",
    "   timeout:",
    "-    1000,",
    "+    10 /* minutes */",
    "+      * 60",
    "+      * 1000,",
    " }, run);",
  ].join("\n");
  const result = testTimeouts(diff);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ line, kind }) => [line, kind]), [[11, "over-cap"]]);
});

test("accepts an empty diff and rejects malformed or truncated input", () => {
  assert.deepEqual(testTimeouts(""), clean);
  for (const diff of [
    "this is not a diff",
    `--- a/${file}\n+++ b/${file}\n@@ invalid @@\n`,
    `--- a/${file}\n+++ b/${file}\n@@ -0,0 +1,2 @@\n+test("one line", run);\n`,
  ]) {
    const result = testTimeouts(diff);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /diff/i);
  }
});

test("accepts Git's no-newline markers and metadata-only changes", () => {
  const diff = [
    `diff --git a/${file} b/${file}`,
    "old mode 100644",
    "new mode 100755",
    "diff --git a/test/pomelo-other.test.ts b/test/pomelo-other.test.ts",
    "--- a/test/pomelo-other.test.ts",
    "+++ b/test/pomelo-other.test.ts",
    "@@ -1 +1 @@",
    '-test("old", run);',
    "\\ No newline at end of file",
    '+test("new", { timeout: 1 }, run);',
    "\\ No newline at end of file",
  ].join("\n");
  assert.deepEqual(testTimeouts(diff), clean);
});
