import assert from "node:assert/strict";
import test from "node:test";
import { checkPrScope } from "../src/pomelo/pr-scope.js";

const pomeloFiles = ["src/pomelo/one.ts", "src/pomelo/two.ts", "src/pomelo/three.ts"];

test("three Pomelo files and one test are within scope", () => {
  assert.deepEqual(checkPrScope([...pomeloFiles, "test/pomelo.test.ts"]), {
    ok: true,
    problems: [],
    counts: { code: 3, tests: 1 },
  });
});

test("four non-test files exceed the limit of three", () => {
  const result = checkPrScope([...pomeloFiles, "src/client/pomelo/four.ts"]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { code: 4, tests: 0 });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /at most 3 non-test files/);
});

test("two test files exceed the limit of one", () => {
  const result = checkPrScope(["test/one.test.ts", "test/pomelo/two.test.ts"]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { code: 0, tests: 2 });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /at most 1 test file/);
});

test("a Friday file requires a change to PATCHES.md", () => {
  const result = checkPrScope(["src/agent-mesh.ts"]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { code: 1, tests: 0 });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /src\/agent-mesh\.ts.*PATCHES\.md/);
});

test("PATCHES.md permits a Friday edit and counts toward the non-test limit", () => {
  const paths = ["src/agent-mesh.ts", "PATCHES.md", "src/client/pomelo/view.ts", "test/pomelo.test.ts"];

  assert.deepEqual(checkPrScope(paths), {
    ok: true,
    problems: [],
    counts: { code: 3, tests: 1 },
  });

  const result = checkPrScope([...paths, "src/pomelo/four.ts"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { code: 4, tests: 1 });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /at most 3 non-test files/);
});

test("changes under .github belong to the config lane even with PATCHES.md", () => {
  const result = checkPrScope([".github/workflows/check.yml", "PATCHES.md"]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { code: 2, tests: 0 });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /\.github\/workflows\/check\.yml.*config lane/);
});

test("Windows-style paths give the same verdict as forward-slash paths", () => {
  const paths = ["src/pomelo/one.ts", "src/client/pomelo/two.ts", "test/pomelo/scope.test.ts"];
  const windowsPaths = paths.map((path) => path.replaceAll("/", "\\"));

  assert.deepEqual(checkPrScope(windowsPaths), checkPrScope(paths));
  assert.equal(checkPrScope(windowsPaths).ok, true);
  assert.deepEqual(
    checkPrScope([".github\\workflows\\check.yml", "src\\agent-mesh.ts"]),
    checkPrScope([".github/workflows/check.yml", "src/agent-mesh.ts"]),
  );
});

test("an empty change list is within scope", () => {
  assert.deepEqual(checkPrScope([]), { ok: true, problems: [], counts: { code: 0, tests: 0 } });
});
