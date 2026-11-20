import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTestReach, type TestReachFile } from "../src/pomelo/test-reach.js";

const source: TestReachFile = {
  path: "src/pomelo/counter.ts",
  status: "added",
  text: "export const count = 1;",
};

function changedTest(text: string, path = "test/counter.test.ts"): TestReachFile {
  return { path, status: "modified", text };
}

const passed = { ok: true, unreached: [], problems: [] };

test("resolves value imports with .js, .ts, or no extension", () => {
  for (const ending of [".js", ".ts", ""]) {
    assert.deepEqual(checkTestReach([
      source,
      changedTest(`import { count } from "../src/pomelo/counter${ending}";`),
    ]), passed, ending);
  }
});

test("names the changed source file when a test imports a different module", () => {
  const result = checkTestReach([source, changedTest('import { count } from "../src/pomelo/other.js";')]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unreached.map(({ path }) => path), [source.path]);
  assert.match(result.unreached[0].reason, /no changed test imports/i);
  assert.ok(result.problems.some((problem) => problem.includes(source.path)));
});

test("ignores import examples inside comments and string literals", () => {
  const snippets = [
    '// import "../src/pomelo/counter.js";',
    '/*\nexport * from "../src/pomelo/counter.js";\n*/',
    `const example = 'import "../src/pomelo/counter.js"';`,
    'const example = `await import("../src/pomelo/counter.js")`;',
    'const example = `snippet ${`nested`} import("../src/pomelo/counter.js")`;',
  ];
  for (const snippet of snippets) {
    assert.deepEqual(checkTestReach([source, changedTest(snippet)]).unreached.map(({ path }) => path), [source.path], snippet);
  }
});

test("ignores type-only imports and re-exports", () => {
  const snippets = [
    'import type { Count } from "../src/pomelo/counter.js";',
    'import { type Count, type Count as Alias } from "../src/pomelo/counter.js";',
    'export type * from "../src/pomelo/counter.js";',
    'export { type Count } from "../src/pomelo/counter.js";',
    'type Count = import("../src/pomelo/counter.js").Count;',
  ];
  for (const snippet of snippets) {
    assert.deepEqual(checkTestReach([source, changedTest(snippet)]).unreached.map(({ path }) => path), [source.path], snippet);
  }
});

test("counts side-effect imports, value re-exports, and dynamic imports", () => {
  const snippets = [
    'import /* keep the side effect */ "../src/pomelo/counter.js";',
    'import { type Count,\n count as current }\n from "../src/pomelo/counter.js";',
    'export * as counter from "../src/pomelo/counter.js";',
    'export {\n count,\n} from "../src/pomelo/counter.js";',
    'const mod = await import(\n /* load later */ "../src/pomelo/counter.js",\n);',
    'const mod = await import(`../src/pomelo/counter.js`);',
    'const sample = `${await import("../src/pomelo/counter.js")}`;',
  ];
  for (const snippet of snippets) {
    assert.deepEqual(checkTestReach([source, changedTest(snippet)]), passed, snippet);
  }
});

test("does not confuse member calls or computed specifiers for literal imports", () => {
  const snippets = [
    'await loader.import("../src/pomelo/counter.js");',
    'await loader?.import("../src/pomelo/counter.js");',
    'await import("../src/pomelo/counter.js" + suffix);',
    'await import("src/pomelo/counter.js");',
  ];
  for (const snippet of snippets) {
    assert.deepEqual(checkTestReach([source, changedTest(snippet)]).unreached.map(({ path }) => path), [source.path], snippet);
  }
});

test("resolves TSX paths relative to the changed test", () => {
  const panel: TestReachFile = { ...source, path: "src/client/pomelo/panel.tsx", status: "modified" };
  for (const ending of [".tsx", ".js", ""]) {
    assert.deepEqual(checkTestReach([
      panel,
      changedTest(`export * from "../../src/client/./pomelo/panel${ending}";`, "test/ui/panel.test.ts"),
    ]), passed, ending);
  }
});

test("credits only the resolved source and combines imports from changed tests", () => {
  const tsx = { ...source, path: "src/pomelo/counter.tsx" };
  const helper = { ...source, path: "src/pomelo/helper.ts" };
  const jsImport = changedTest('import "../src/pomelo/counter.js";');
  const tsxImport = changedTest('import "../src/pomelo/counter.tsx";', "test/panel.test.ts");
  const files = [source, tsx, helper];
  assert.deepEqual(checkTestReach([...files, jsImport]).unreached.map(({ path }) => path), [tsx.path, helper.path]);
  assert.deepEqual(checkTestReach([...files, jsImport, tsxImport]).unreached.map(({ path }) => path), [helper.path]);
});

test("resolves escaped literal paths from normalized changed paths", () => {
  const testText = 'import "../src/pomelo/count\\u0065r.js";';
  assert.deepEqual(checkTestReach([
    { ...source, path: ".\\src\\pomelo\\counter.ts" },
    changedTest(testText, ".\\test\\counter.test.ts"),
  ]), passed);
});

test("ignores deleted files, declarations, and files outside the Pomelo source folders", () => {
  assert.deepEqual(checkTestReach([
    { ...source, status: "deleted" },
    { ...source, path: "src/app.ts" },
    { ...source, path: "src/pomelo/types.d.ts" },
    { ...source, path: "src/pomelo/fixture.js" },
  ]), passed);
});

test("reports every source when no changed test qualifies", () => {
  const panel = { ...source, path: "src/client/pomelo/panel.tsx" };
  const testText = 'import "../src/pomelo/counter.js";';
  for (const otherFiles of [[], [
    { ...changedTest(testText), status: "deleted" },
    changedTest(testText, "tools/counter.test.ts"),
    changedTest(testText, "test/counter.ts"),
  ]]) {
    const result = checkTestReach([source, panel, ...otherFiles]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.unreached.map(({ path }) => path), [source.path, panel.path]);
    assert.equal(result.problems.length, 2);
  }
});
