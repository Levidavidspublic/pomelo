import assert from "node:assert/strict";
import { test } from "node:test";
import { checkScopeMatch } from "../src/pomelo/scope-match.js";

const sourcePath = "src/pomelo/scope-match.ts";
const testPath = "test/pomelo-scope-match.test.ts";
const scope = `SCOPE: \`${sourcePath}\` \`${testPath}\``;

test("accepts an exact match", () => {
  assert.deepEqual(checkScopeMatch(scope, [sourcePath, testPath]), {
    ok: true,
    outside: [],
    untouched: [],
    reasons: [],
  });
});

test("names a changed file outside SCOPE", () => {
  const extraPath = "src/pomelo/extra.ts";
  const result = checkScopeMatch(scope, [sourcePath, testPath, extraPath]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.outside, [extraPath]);
  assert.deepEqual(result.untouched, []);
  assert.ok(result.reasons.some((reason) => reason.includes(extraPath)));
});

test("reports an untouched source file without failing the check", () => {
  assert.deepEqual(checkScopeMatch(scope, [testPath]), {
    ok: true,
    outside: [],
    untouched: [sourcePath],
    reasons: [],
  });
});

test("requires the listed test file to be changed", () => {
  const result = checkScopeMatch(scope, [sourcePath]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.outside, []);
  assert.deepEqual(result.untouched, [testPath]);
  assert.ok(result.reasons.some((reason) => reason.includes(testPath)));
});

test("normalizes prefixes, separators, and surrounding whitespace on both sides", () => {
  const windowsScope = "SCOPE: ` .\\src\\pomelo\\scope-match.ts ` `test/pomelo-scope-match.test.ts`";
  assert.deepEqual(checkScopeMatch(windowsScope, [sourcePath, ".\\test\\pomelo-scope-match.test.ts "]), {
    ok: true,
    outside: [],
    untouched: [],
    reasons: [],
  });
});

test("compares paths case-sensitively", () => {
  const differentlyCasedPath = "src/pomelo/Scope-Match.ts";
  const result = checkScopeMatch(scope, [differentlyCasedPath, testPath]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.outside, [differentlyCasedPath]);
  assert.deepEqual(result.untouched, [sourcePath]);
});

test("rejects SCOPE without a nonempty backticked path", () => {
  for (const emptyScope of ["", `SCOPE: ${sourcePath}`, "SCOPE: ` ` `./`", "SCOPE: `unclosed.ts"]) {
    const result = checkScopeMatch(emptyScope, [sourcePath]);

    assert.equal(result.ok, false);
    assert.deepEqual(result.outside, [sourcePath]);
    assert.deepEqual(result.untouched, []);
    assert.ok(result.reasons.some((reason) => /SCOPE.*backticks/.test(reason)));
  }
});

test("reports distinct paths in sorted order after normalization", () => {
  const repeatedScope = `SCOPE: \`src/pomelo/z.ts\` \`./src/pomelo/z.ts\` \`${sourcePath}\` \`${testPath}\``;
  const changed = ["./src/pomelo/y.ts ", "src/pomelo/a.ts", "src\\pomelo\\y.ts", testPath];
  const result = checkScopeMatch(repeatedScope, changed);

  assert.equal(result.ok, false);
  assert.deepEqual(result.outside, ["src/pomelo/a.ts", "src/pomelo/y.ts"]);
  assert.deepEqual(result.untouched, [sourcePath, "src/pomelo/z.ts"]);
  assert.deepEqual(checkScopeMatch(repeatedScope, changed.toReversed()), result);
});
