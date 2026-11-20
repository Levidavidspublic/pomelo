import assert from "node:assert/strict";
import test from "node:test";
import type { AddedLine } from "../src/pomelo/e2e-mocks.js";
import { selfMockLines } from "../src/pomelo/self-mocks.js";

const path = "test/pomelo-mask.test.ts";
const moduleCall = ["mock", "module"].join(".");
const methodCall = ["mock", "method"].join(".");
const flag = ["--experimental", "test", "module", "mocks"].join("-");

test("reports Pomelo module mocks on the added call line", () => {
  const added = [
    { path, line: 4, text: `${moduleCall}('../src/pomelo/mask.ts', { namedExports: fixture });` },
    { path, line: 5, text: `t.${moduleCall}("../src/client/pomelo/rail-row.ts");` },
    { path, line: 7, text: `  ${moduleCall}(` },
    { path, line: 8, text: "    '../src/pomelo/mask.ts', fixture);" },
    { path, line: 10, text: `${moduleCall}('../src/runner/adapters.ts', fixture);` },
    { path, line: 11, text: `${moduleCall}(otherPath, '../src/pomelo/mask.ts');` },
    { path, line: 12, text: `${moduleCall}('../src/pomelo-utils.ts', fixture);` },
  ];

  const findings = selfMockLines(added);
  assert.deepEqual(findings.map(({ path, line, kind }) => ({ path, line, kind })), [
    { path, line: 4, kind: "module" },
    { path, line: 5, kind: "module" },
    { path, line: 7, kind: "module" },
  ]);
  for (const finding of findings) {
    assert.deepEqual(Object.keys(finding).sort(), ["kind", "line", "path", "reason"]);
    assert.ok(finding.reason.trim());
  }
  for (const { text } of added) {
    assert.ok(!JSON.stringify(findings).includes(text));
  }
  assert.doesNotMatch(JSON.stringify(findings), /src\/pomelo|namedExports|rail-row/);
});

test("reports method mocks of runtime imports from Pomelo in the same test", () => {
  const added = [
    { path, line: 14, text: `${methodCall}(maskModule, 'maskText');` },
    { path, line: 1, text: "import * as maskModule from '../src/pomelo/mask.ts';" },
    { path, line: 2, text: "import row, {" },
    { path, line: 3, text: "  helpers as railHelpers, options, type RowOptions," },
    { path, line: 4, text: "} from '../src/client/pomelo/rail-row.ts';" },
    { path, line: 5, text: "import { options as fridayOptions } from '../src/runner/adapters.ts';" },
    { path, line: 6, text: "import type { MaskOptions } from '../src/pomelo/mask.ts';" },
    { path, line: 15, text: `t.${methodCall}(railHelpers, 'label');` },
    { path, line: 16, text: `  ${methodCall}(row, 'render');` },
    { path, line: 17, text: `  ${methodCall}(options, 'apply');` },
    { path, line: 18, text: `  ${methodCall}(fridayOptions, 'apply');` },
    { path, line: 19, text: `  ${methodCall}(railHelpers.child, 'label');` },
    { path, line: 20, text: `  ${methodCall}(RowOptions, 'name');` },
    { path, line: 21, text: `  ${methodCall}(MaskOptions, 'name');` },
    { path, line: 22, text: `  ${methodCall}(helpers, 'label');` },
    { path: "test/pomelo-other.test.ts", line: 2, text: `${methodCall}(maskModule, 'maskText');` },
  ];

  assert.deepEqual(selfMockLines(added).map(({ path, line, kind }) => ({ path, line, kind })), [
    { path, line: 14, kind: "method" },
    { path, line: 15, kind: "method" },
    { path, line: 16, kind: "method" },
    { path, line: 17, kind: "method" },
  ]);
});

test("allows injected fakes, local object mocks and examples in comments or strings", () => {
  assert.deepEqual(selfMockLines([
    { path, line: 1, text: "const fakeStore = { get: () => null };" },
    { path, line: 2, text: `${methodCall}(fakeStore, 'get');` },
    { path, line: 3, text: "await execute({ run: mock.fn(), fill: mock.fn(), store: fakeStore, clock });" },
    { path, line: 4, text: `// ${moduleCall}('../src/pomelo/mask.ts', fixture);` },
    { path, line: 5, text: `const example = "${moduleCall}('../src/pomelo/mask.ts', fixture)";` },
    { path, line: 6, text: "/*" },
    { path, line: 7, text: `${moduleCall}('../src/pomelo/mask.ts', fixture);` },
    { path, line: 8, text: "*/" },
    { path, line: 9, text: `other.${moduleCall}('../src/pomelo/mask.ts', fixture);` },
    { path, line: 10, text: "// import * as fakeStore from '../src/pomelo/store.ts';" },
  ]), []);
});

test("reports the flag in comments and strings and sorts by file then line", () => {
  const other = "test/pomelo-z.test.ts";
  const added = [
    { path: other, line: 2, text: `const options = "${flag}";` },
    { path, line: 12, text: `// ${flag}` },
    { path: "test/lanes.test.ts", line: 1, text: `// ${flag}` },
    { path: "src/pomelo/mask.ts", line: 1, text: `${moduleCall}('../src/pomelo/mask.ts');` },
    { path, line: 3, text: `/* ${flag} */` },
    { path: "test/pomelo-nested/other.test.ts", line: 1, text: `// ${flag}` },
  ];

  assert.deepEqual(selfMockLines(added).map(({ path, line, kind }) => ({ path, line, kind })), [
    { path, line: 3, kind: "module-mocks-flag" },
    { path, line: 12, kind: "module-mocks-flag" },
    { path: other, line: 2, kind: "module-mocks-flag" },
  ]);
});

test("ignores empty and malformed input", () => {
  for (const input of [undefined, null, {}, [], [
    undefined,
    { path, line: 1 },
    { path, line: "2", text: flag },
    { path, line: 0, text: flag },
    { path, line: 2.5, text: flag },
    { path: 1, line: 3, text: flag },
    { path, line: 4, text: 42 },
  ]]) {
    assert.deepEqual(selfMockLines(input as AddedLine[]), []);
  }
});
