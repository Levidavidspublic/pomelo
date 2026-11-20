import assert from "node:assert/strict";
import test from "node:test";
import { rerunVerdict } from "../src/pomelo/rerun-verdict.js";

function compare(firstOutput: string, secondOutput: string, firstSha = "abc123", secondSha = "abc123") {
  return rerunVerdict({ firstOutput, secondOutput, firstSha, secondSha });
}

test("returns green when the same tests pass in both runs", () => {
  const first = "✔ loads (12ms)\n✔ saves (3ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0";
  const second = "✔ saves (4ms)\n✔ loads (11ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0";
  const result = compare(first, second);
  assert.equal(result.verdict, "green");
  assert.deepEqual(result.flaky, []);
});

test("returns red for a failure in both runs", () => {
  const result = compare("✖ saves (3ms)", "✖ saves (4ms)");
  assert.equal(result.verdict, "red");
  assert.deepEqual(result.flaky, []);
});

test("names a test that changes outcome in either direction", () => {
  const pass = "✔ saves (12ms)";
  const fail = "✖ saves (3ms)";
  for (const [first, second] of [[pass, fail], [fail, pass]]) {
    const result = compare(first, second);
    assert.equal(result.verdict, "flaky");
    assert.deepEqual(result.flaky, [{ name: "saves" }]);
  }
});

test("names tests missing from either run and sorts and deduplicates findings", () => {
  const first = "✔ stable (1ms)\n✔ zebra (2ms)\n✔ zebra (2ms)";
  const second = "✔ stable (2ms)\n✖ apple (1ms)";
  const result = compare(first, second);
  assert.equal(result.verdict, "flaky");
  assert.deepEqual(result.flaky, [{ name: "apple" }, { name: "zebra" }]);
});

test("reports changed outcomes even when another test fails in both runs", () => {
  const result = compare("✖ stable failure (1ms)\n✖ saves (1ms)", "✖ stable failure (2ms)\n✔ saves (2ms)");
  assert.equal(result.verdict, "flaky");
  assert.deepEqual(result.flaky, [{ name: "saves" }]);
});

test("returns unknown for different commits, missing SHAs, or missing test lines", () => {
  const pass = "✔ example (12ms)";
  for (const result of [
    compare(pass, pass, "abc123", "def456"),
    compare(pass, pass, "", "abc123"),
    compare(pass, pass, "abc123", " "),
    compare("", pass),
    compare(pass, "TAP version 13\n1..0\n# tests 0\n# pass 0\n# fail 0"),
    compare(pass, "ℹ tests 1\nℹ pass 1\nℹ fail 0"),
  ]) {
    assert.equal(result.verdict, "unknown");
    assert.deepEqual(result.flaky, []);
  }
});

test("reads coloured TAP results and uses the failure location for a matching name", () => {
  const pass = "TAP version 13\r\n\x1b[32mok 1 - saves \\# draft\x1b[0m\r\n# tests 1\r\n# pass 1";
  const fail = [
    "TAP version 13",
    "not ok 1 - saves \\# draft",
    "  ---",
    "  duration_ms: 3",
    "  location: 'test/example.test.ts:4:1'",
    "  error: |-",
    "    ok 2 - assertion message",
    "  ...",
    "# tests 1",
    "# fail 1",
  ].join("\n");
  const result = compare(pass, fail);
  assert.equal(result.verdict, "flaky");
  assert.deepEqual(result.flaky, [{ file: "test/example.test.ts", name: "saves # draft" }]);
  assert.equal(compare(pass, pass).verdict, "green");
  assert.equal(compare(fail, fail).verdict, "red");
});

test("matches equal names by file and ignores enclosing file totals and duplicate failure details", () => {
  const first = [
    "▶ test/a.test.ts",
    "  \x1b[31m✖ same name (3ms)\x1b[0m",
    "✖ test/a.test.ts (9ms)",
    "▶ test/b.test.ts",
    "  ✔ same name (4ms)",
    "✔ test/b.test.ts (10ms)",
    "✖ failing tests:",
    "test at test/a.test.ts:2:1",
    "✖ same name (3ms)",
  ].join("\n");
  const second = [
    "▶ test/b.test.ts",
    "  ✔ same name (2ms)",
    "✔ test/b.test.ts (8ms)",
    "▶ test/a.test.ts",
    "  ✔ same name (1ms)",
    "✔ test/a.test.ts (7ms)",
  ].join("\n");
  const result = compare(first, second);
  assert.equal(result.verdict, "flaky");
  assert.deepEqual(result.flaky, [{ file: "test/a.test.ts", name: "same name" }]);
});

test("uses a spec failure footer to identify the file without adding a second test", () => {
  const first = "✖ saves (3ms)\n✖ failing tests:\ntest at test/example.test.ts:4:1\n✖ saves (3ms)";
  const result = compare(first, "✔ saves (2ms)");
  assert.equal(result.verdict, "flaky");
  assert.deepEqual(result.flaky, [{ file: "test/example.test.ts", name: "saves" }]);
});

test("uses Friday's single-file command when the reporter omits the file", () => {
  const header = "> node scripts/test.mjs test/example.test.ts\n";
  const result = compare(`${header}✔ saves (1ms)`, `${header}not ok 1 - saves`);
  assert.equal(result.verdict, "flaky");
  assert.deepEqual(result.flaky, [{ file: "test/example.test.ts", name: "saves" }]);
});

test("keeps identical names from different files as distinct tests", () => {
  const first = "▶ test/b.test.ts\n  ✔ example (1ms)\n✔ test/b.test.ts (2ms)";
  const second = "▶ test/a.test.ts\n  ✔ example (1ms)\n✔ test/a.test.ts (2ms)";
  const result = compare(first, second);
  assert.equal(result.verdict, "flaky");
  assert.deepEqual(result.flaky, [
    { file: "test/a.test.ts", name: "example" },
    { file: "test/b.test.ts", name: "example" },
  ]);
});

test("does not give green for skips or for failures shown only in a summary", () => {
  const skip = "ok 1 - example # SKIP later\n# tests 1\n# pass 0\n# skipped 1";
  const partial = "✔ example (1ms)\nℹ tests 2\nℹ pass 1\nℹ fail 1";
  assert.equal(compare(skip, skip).verdict, "unknown");
  assert.equal(compare(partial, partial).verdict, "unknown");
});

test("returns a plain reason without copying output", () => {
  const first = "✖ distinctive assertion text (3ms)\nError: distinctive details";
  const second = "✔ distinctive assertion text (5ms)";
  const { reason } = compare(first, second);
  assert.match(reason, /^[^.!?\r\n]+\.$/);
  assert.doesNotMatch(reason, /distinctive/);
});
