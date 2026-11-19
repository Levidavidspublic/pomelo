import assert from "node:assert/strict";
import test from "node:test";
import { checkTestsFirst } from "../src/pomelo/tests-first.js";

test("added Pomelo code with a modified Pomelo test passes", () => {
  assert.deepEqual(checkTestsFirst([
    { path: "src/pomelo/check.ts", status: "added" },
    { path: "test/pomelo-check.test.ts", status: "modified" },
  ]), {
    ok: true,
    problems: [],
    code: ["src/pomelo/check.ts"],
    tests: ["test/pomelo-check.test.ts"],
  });
});

test("an added Pomelo test covers modified Pomelo code", () => {
  assert.equal(checkTestsFirst([
    { path: "src/pomelo/check.ts", status: "modified" },
    { path: "test/pomelo-check.test.ts", status: "added" },
  ]).ok, true);
});

test("missing tests are reported for each changed server and client code file in sorted order", () => {
  const changes = [
    { path: "src/pomelo/check.ts", status: "added" },
    { path: "src/client/pomelo/view.tsx", status: "modified" },
    { path: "src/client/pomelo/model.ts", status: "added" },
  ] as const;
  const result = checkTestsFirst(changes);

  assert.equal(result.ok, false);
  assert.deepEqual(result.code, ["src/client/pomelo/model.ts", "src/client/pomelo/view.tsx", "src/pomelo/check.ts"]);
  assert.deepEqual(result.tests, []);
  assert.equal(result.problems.length, result.code.length);
  for (const [index, path] of result.code.entries()) {
    assert.ok(result.problems[index].includes(path));
  }
  assert.deepEqual(checkTestsFirst([...changes].reverse()), result);
});

test("a deleted Pomelo test is named even when a qualifying test is added", () => {
  const result = checkTestsFirst([
    { path: "src/pomelo/check.ts", status: "modified" },
    { path: "test/pomelo-new.test.ts", status: "added" },
    { path: "test/pomelo-old.test.ts", status: "deleted" },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.tests, ["test/pomelo-new.test.ts"]);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /test\/pomelo-old\.test\.ts/);
});

test("a deleted Pomelo test does not cover changed code", () => {
  const result = checkTestsFirst([
    { path: "src/pomelo/check.ts", status: "modified" },
    { path: "test/pomelo-check.test.ts", status: "deleted" },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.tests, []);
  assert.equal(result.problems.length, 2);
  assert.ok(result.problems.some((problem) => problem.includes("src/pomelo/check.ts")));
  assert.ok(result.problems.some((problem) => problem.includes("test/pomelo-check.test.ts")));
});

test("a Pomelo test renamed outside the pattern is reported by its original path", () => {
  const result = checkTestsFirst([
    { path: "test/check.test.ts", previousPath: ".\\test\\pomelo-check.test.ts", status: "renamed" },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /test\/pomelo-check\.test\.ts/);
});

test("a rename without a previous path is flagged when its destination matches the test pattern", () => {
  const result = checkTestsFirst([{ path: "test/pomelo-check.test.ts", status: "renamed" }]);

  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /test\/pomelo-check\.test\.ts/);
});

test("a rename without a previous path is flagged even when its destination is outside the test pattern", () => {
  const result = checkTestsFirst([{ path: ".\\test\\check.test.ts", status: "renamed" }]);

  assert.deepEqual(result, {
    ok: false,
    problems: ['The rename to "test/check.test.ts" needs a previous path.'],
    code: [],
    tests: [],
  });
});

test("renames within or into the Pomelo test pattern do not count as added or modified tests", () => {
  const renames = [
    { path: "test/pomelo-new.test.ts", previousPath: "test/pomelo-old.test.ts", status: "renamed" },
    { path: "test/pomelo-check.test.ts", previousPath: "test/check.test.ts", status: "renamed" },
  ] as const;

  assert.deepEqual(checkTestsFirst(renames), { ok: true, problems: [], code: [], tests: [] });
  const result = checkTestsFirst([...renames, { path: "src/pomelo/check.ts", status: "modified" }]);
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /src\/pomelo\/check\.ts/);
});

test("renames to server and client Pomelo code paths require an added or modified test", () => {
  const renames = [
    { path: "./src/pomelo/check.ts", previousPath: "src/shared/check.ts", status: "renamed" },
    { path: ".\\src\\client\\pomelo\\view.tsx", previousPath: "src/client/view.tsx", status: "renamed" },
    { path: "src/shared/model.ts", previousPath: "src/pomelo/model.ts", status: "renamed" },
  ] as const;
  const code = ["src/client/pomelo/view.tsx", "src/pomelo/check.ts"];
  const result = checkTestsFirst(renames);

  assert.equal(result.ok, false);
  assert.deepEqual(result.code, code);
  assert.deepEqual(result.tests, []);
  assert.equal(result.problems.length, code.length);
  for (const [index, path] of code.entries()) {
    assert.ok(result.problems[index].includes(path));
  }
  assert.deepEqual(checkTestsFirst([
    ...renames,
    { path: "test/pomelo-check.test.ts", status: "added" },
  ]), { ok: true, problems: [], code, tests: ["test/pomelo-check.test.ts"] });
});

test("deleting Pomelo code alone passes", () => {
  assert.deepEqual(checkTestsFirst([{ path: "src/pomelo/check.ts", status: "deleted" }]), {
    ok: true, problems: [], code: [], tests: [],
  });
});

test("Friday tests, helpers and nested tests do not count as Pomelo tests", () => {
  const result = checkTestsFirst([
    { path: "src/pomelo/check.ts", status: "modified" },
    { path: "test/theme.test.ts", status: "modified" },
    { path: "test/pomelo-helper.ts", status: "added" },
    { path: "test/fixtures/pomelo-check.test.ts", status: "added" },
    { path: "test/pomelo-fixtures/check.test.ts", status: "added" },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.tests, []);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /src\/pomelo\/check\.ts/);
});

test("docs-only, tests-only and empty changes pass", () => {
  assert.deepEqual(checkTestsFirst([{ path: "docs/guide.md", status: "modified" }]), {
    ok: true, problems: [], code: [], tests: [],
  });
  assert.deepEqual(checkTestsFirst([
    { path: "test/pomelo-z.test.ts", status: "added" },
    { path: "test/pomelo-a.test.ts", status: "modified" },
  ]), {
    ok: true, problems: [], code: [], tests: ["test/pomelo-a.test.ts", "test/pomelo-z.test.ts"],
  });
  assert.deepEqual(checkTestsFirst([]), { ok: true, problems: [], code: [], tests: [] });
});

test("backslashes and a leading dot slash are normalized", () => {
  assert.deepEqual(checkTestsFirst([
    { path: ".\\src\\pomelo\\check.ts", status: "modified" },
    { path: ".\\test\\pomelo-check.test.ts", status: "added" },
  ]), {
    ok: true, problems: [], code: ["src/pomelo/check.ts"], tests: ["test/pomelo-check.test.ts"],
  });
});
