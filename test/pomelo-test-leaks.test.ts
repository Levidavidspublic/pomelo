import assert from "node:assert/strict";
import test from "node:test";
import { TEST_LEAK_RULES, testLeakGuard } from "../src/pomelo/test-leaks.js";

const path = "test/pomelo-example.test.ts";

function added(...lines: string[]) {
  return lines.map((text, index) => ({ line: index + 10, text }));
}

function check(...lines: string[]) {
  return testLeakGuard([{ path, added: added(...lines) }]);
}

test("reports changes to shared state by added line, rule and target", () => {
  const cases = [
    ['process.env.POMELO_SAMPLE = "value";', "env", "process.env.POMELO_SAMPLE"],
    ["delete process.env.POMELO_EMPTY;", "env", "process.env.POMELO_EMPTY"],
    ["process.chdir(dir);", "chdir", "process.chdir"],
    ["Date.now = clock;", "date-now", "Date.now"],
    ["Math.random = rng;", "math-random", "Math.random"],
    ["globalThis.fetch = fetchStub;", "global", "globalThis.fetch"],
    ["global.setTimeout = timerStub;", "global", "global.setTimeout"],
    ["Store.prototype.get = getStub;", "prototype", "Store.prototype.get"],
    ['process.on("exit", listener);', "process-listener", "process.on"],
    ['process.once("exit", listener);', "process-listener", "process.once"],
  ] as const;
  const findings = check(...cases.map(([line]) => line));
  assert.deepEqual(findings.map(({ path, line, rule }) => ({ path, line, rule })),
    cases.map(([, rule], index) => ({ path, line: index + 10, rule })));
  for (const [index, [, , target]] of cases.entries()) {
    assert.ok(findings[index].reason.includes(target));
  }
  assert.ok(Object.isFrozen(TEST_LEAK_RULES));
  assert.ok(TEST_LEAK_RULES.every(({ id, pattern, reason }) => id && pattern instanceof RegExp && reason));
});

test("accepts matching cleanup in a separate added hunk", () => {
  assert.deepEqual(testLeakGuard([{
    path,
    addedLines: [
      { line: 4, text: "const originalNow = Date.now;" },
      { line: 15, text: "Date.now = fakeClock;" },
      { line: 42, text: "after(() => { Date.now = originalNow; });" },
    ],
  }]), []);
});

test("accepts afterEach callbacks and finally blocks", () => {
  assert.deepEqual(check(
    "const was = globalThis.fetch;",
    "afterEach(function () {",
    "  globalThis.fetch = was;",
    "});",
    "globalThis.fetch = stub;",
    "const cwd = process.cwd();",
    "try {",
    "  process.chdir(fixtures);",
    "} finally {",
    "  process.chdir(cwd);",
    "}",
  ), []);
});

test("accepts Friday's t.after pattern for both setting and deleting an environment key", () => {
  assert.deepEqual(check(
    "const was = process.env.SAMPLE;",
    "t.after(() => (was === undefined ? delete process.env.SAMPLE : (process.env.SAMPLE = was)));",
    'process.env.SAMPLE = "fixture";',
    "delete process.env.SAMPLE;",
  ), []);
});

test("accepts automatic mocks and matching process-listener removal", () => {
  assert.deepEqual(check(
    't.mock.method(Date, "now", stub);',
    'mock.method(Math, "random", stub);',
    'process.once("exit", listener);',
    "after(() => process.off('exit', listener));",
    'process.on("beforeExit", listener);',
    't.after(() => process.removeListener("beforeExit", listener));',
  ), []);
});

test("accepts deletion of properties introduced by a test", () => {
  assert.deepEqual(check(
    "globalThis.testHelper = helper;",
    "Store.prototype.testMethod = stub;",
    "after(() => {",
    "  delete global.testHelper;",
    "  delete Store.prototype.testMethod;",
    "});",
  ), []);
});

test("a cleanup only covers the same target or listener in the same file", () => {
  const findings = testLeakGuard([
    { path, added: added(
      'process.env.SAMPLE = "fixture";',
      "globalThis.fetch = stub;",
      'process.on("exit", keep);',
      'process.once("beforeExit", other);',
      't.mock.method(Date, "now", stub);',
      "afterEach(() => {",
      "  delete process.env.UNRELATED;",
      '  process.off("exit", other);',
      '  process.removeListener("beforeExit", other);',
      "});",
    ) },
    { path: "test/pomelo-other.test.ts", added: added("after(() => delete process.env.SAMPLE);") },
  ]);
  assert.deepEqual(findings.map(({ line, rule }) => ({ line, rule })), [
    { line: 10, rule: "env" },
    { line: 11, rule: "global" },
    { line: 12, rule: "process-listener" },
  ]);
});

test("cleanup markers only count inside actual callback and finally bodies", () => {
  const findings = check(
    "Date.now = stub;",
    "// after(() => { Date.now = saved; });",
    'const note = "afterEach(() => { Date.now = saved; });";',
    "ordinary.after(() => { Date.now = saved; });",
    "after(() => { assert.ok(ready); }); Math.random = stub;",
    "try { ready(); } finally {} global.fetch = stub;",
  );
  assert.deepEqual(findings.map(({ line }) => line), [10, 13, 14, 15]);
});

test("a chdir cleanup has to point to a different directory", () => {
  const findings = check(
    'process.chdir("fixtures");',
    "after(() => process.chdir('fixtures'));",
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 10);
});

test("ignores comments, literal text, reads, comparisons and lookalikes", () => {
  assert.deepEqual(check(
    '// process.env.SAMPLE = "ignored";',
    "/* start of block",
    "Date.now = stub;",
    "*/",
    'const text = "process.chdir(dir);";',
    "const single = 'delete process.env.SAMPLE';",
    "const escaped = \"\\\"globalThis.fetch = stub\";",
    "const template = `Date.now = clock;",
    "process.on('exit', listener);`;",
    "const example = /Date.now = clock/;",
    'assert.equal(process.env.SAMPLE === "fixture", true);',
    "Date.now(); Math.random();",
    "other.process.chdir(dir); fakeDate.now = stub;",
  ), []);
});

test("checks only top-level Pomelo tests and allows exact paths", () => {
  const lines = added("Date.now = stub;");
  const findings = testLeakGuard([
    { path: "src/pomelo/example.ts", added: lines },
    { path: "test/friday.test.ts", added: lines },
    { path: "test/nested/pomelo-example.test.ts", added: lines },
    { path, added: lines },
    { path: "test/pomelo-example-more.test.ts", added: lines },
  ], [path]);
  assert.deepEqual(findings.map((finding) => finding.path), ["test/pomelo-example-more.test.ts"]);
});

test("sorts findings by path and line and never returns assigned values", () => {
  const sample = "fixture-secret-looking-value-8c730a";
  const findings = testLeakGuard([
    { path: "test/pomelo-z.test.ts", added: [
      { line: 90, text: `process.env.SAMPLE = "${sample}";` },
      { line: 12, text: "Date.now = stub;" },
    ] },
    { path, added: added("Math.random = stub;") },
  ]);
  assert.deepEqual(findings.map(({ path, line }) => [path, line]), [
    [path, 10], ["test/pomelo-z.test.ts", 12], ["test/pomelo-z.test.ts", 90],
  ]);
  assert.ok(JSON.stringify(findings).includes("process.env.SAMPLE"));
  assert.ok(!JSON.stringify(findings).includes(sample));
});

test("handles bracketed environment keys and writes split across added lines", () => {
  assert.deepEqual(check(
    "const was = process.env[key];",
    "try {",
    "  process.env[key] = fixture;",
    "} finally {",
    "  if (was === undefined) delete process.env[key];",
    "  else process.env[key] = was;",
    "}",
  ), []);
  const findings = check(
    "process.env",
    '  ["SAMPLE"] += suffix;',
    'after(() => { delete process.env.OTHER; });',
    "const value = `with interpolation ${(Date.now = stub)}`;",
  );
  assert.deepEqual(findings.map(({ line, rule }) => ({ line, rule })), [
    { line: 10, rule: "env" }, { line: 13, rule: "date-now" },
  ]);
});
