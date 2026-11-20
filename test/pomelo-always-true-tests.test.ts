import { test } from "node:test";
import assert from "node:assert/strict";
import { findAlwaysTrueChecks, type AlwaysTrueTestFile } from "../src/pomelo/always-true-tests.js";

const file = (path: string, line: number, ...texts: string[]): AlwaysTrueTestFile => ({
  path,
  addedLines: texts.map((text, i) => ({ line: line + i, text })),
});

const sample = (method: string, args: string) => `assert.${method}(${args});`;
const finding = (path: string, line: number, reason: string) => ({ path, line, reason });

test("finds truthy direct and ok assertions but not real checks or falsy literals", () => {
  const path = "test/pomelo-truth.test.ts";
  const input = file(path, 8,
    `assert.ok(${"tr" + "ue"});`,
    `assert(${"tr" + "ue"});`,
    sample("ok", "1"),
    sample("ok", "-5"),
    sample("ok", "'nonempty'"),
    sample("ok", "0"),
    sample("ok", "false"),
    sample("ok", "result.status"),
    sample("ok", "''"),
    sample("ok", "null"),
  );
  assert.deepEqual(findAlwaysTrueChecks([input]), {
    ok: false,
    findings: [8, 9, 10, 11, 12].map(line => finding(path, line, "truthy-literal")),
  });
});

test("compares the same literal, identifier or member expression", () => {
  const path = "test/pomelo-comparison.test.ts";
  const checks = [
    sample("equal", "1, 1"),
    sample("strictEqual", "left, left"),
    sample("deepEqual", "x.y, x.y"),
    sample("deepStrictEqual", "obj.value, obj.value"),
    sample("equal", "'same', 'same'"),
    sample("equal", "null, null"),
    sample("strictEqual", "a, b"),
    sample("deepEqual", "x.y, x.z"),
    sample("equal", "getResult(), getResult()"),
    sample("strictEqual", "1, '1'"),
    sample("equal", "result.status, 'ok'"),
  ];
  assert.deepEqual(findAlwaysTrueChecks([file(path, 25, ...checks)]), {
    ok: false,
    findings: [25, 26, 27, 28, 29, 30].map(line => finding(path, line, "same-value")),
  });
});

test("flags distinct literal values in notEqual but not equal or uncertain values", () => {
  const path = "test/pomelo-not-equal.test.ts";
  assert.deepEqual(findAlwaysTrueChecks([file(path, 50,
    sample("notEqual", "1, 2"),
    sample("notEqual", "'cat', 'dog'"),
    sample("notEqual", "true, false"),
    sample("notEqual", "1, 1"),
    sample("notEqual", "a, b"),
    sample("notEqual", "1, '1'"),
    sample("equal", "1, 2"),
    sample("notEqual", "result.code, 200"),
  )]), {
    ok: false,
    findings: [50, 51, 52].map(line => finding(path, line, "distinct-literals")),
  });
});

test("flags doesNotThrow on empty arrow callbacks without flagging meaningful callbacks", () => {
  const path = "test/pomelo-no-throw.test.ts";
  assert.deepEqual(findAlwaysTrueChecks([file(path, 10,
    sample("doesNotThrow", "() => {}"),
    sample("doesNotThrow", "async () => { }"),
    sample("doesNotThrow", "() => run()"),
    sample("doesNotThrow", "() => { run(); }"),
  )]), {
    ok: false,
    findings: [10, 11].map(line => finding(path, line, "empty-callback")),
  });
});

test("ignores comments, quoted strings and assertion snippets inside template literals", () => {
  const path = "test/pomelo-context.test.ts";
  const literal = sample("ok", "true");
  assert.deepEqual(findAlwaysTrueChecks([file(path, 1,
    `// ${literal}`,
    `const line = "${literal}";`,
    `const other = '${literal}';`,
    `const template = \`${literal}\`;`,
    `/* ${literal}`,
    `  ${literal} */`,
    `/* ${literal} */ assert.equal(actual, expected);`,
    `assert.equal(actual, expected); // ${literal}`,
    `assert.equal(actual, expected); /* ${literal} */`,
  )]), { ok: true, findings: [] });
});

test("works after code on the same line and ignores assertions on unrelated objects", () => {
  const path = "test/pomelo-inline.test.ts";
  assert.deepEqual(findAlwaysTrueChecks([file(path, 12,
    `test('case', () => { ${sample("ok", "true")} });`,
    "logger.assert.ok(true);",
    "const assertMsg = 'assert.ok(true)'",
    "assert.notEqual(9, 10); assert.equal(result, expected);",
  )]), {
    ok: false,
    findings: [finding(path, 12, "truthy-literal"), finding(path, 15, "distinct-literals")],
  });
});

test("filters to Pomelo test paths (not Friday or other source)", () => {
  const hit = sample("ok", "true");
  assert.deepEqual(findAlwaysTrueChecks([
    file("test/old.test.ts", 1, hit),
    file("src/pomelo/checks.ts", 2, hit),
    file("test/pomelo-example.test.js", 3, hit),
    file("test/pomelo-example.test.ts", 4, hit),
    file("test/other-pomelo-example.test.ts", 5, hit),
    file("test/pomelo-a.test.ts/extra", 6, hit),
  ]), { ok: false, findings: [finding("test/pomelo-example.test.ts", 4, "truthy-literal")] });
});

test("sorts results by path then line regardless of input order, and omits source text", () => {
  const input = [
    file("test/pomelo-z.test.ts", 7, sample("ok", "true")),
    { path: "test/pomelo-a.test.ts", addedLines: [
      { line: 12, text: sample("notEqual", "2, 3") },
      { line: 3, text: sample("equal", "x, x") },
    ] },
  ];
  const expected = [
    finding("test/pomelo-a.test.ts", 3, "same-value"),
    finding("test/pomelo-a.test.ts", 12, "distinct-literals"),
    finding("test/pomelo-z.test.ts", 7, "truthy-literal"),
  ];
  assert.deepEqual(findAlwaysTrueChecks(input), { ok: false, findings: expected });
  assert.equal(JSON.stringify(findAlwaysTrueChecks(input)).includes(sample("ok", "true")), false);
});

test("malformed and missing data does not throw or produce phantom findings", () => {
  for (const input of [null, undefined, true, 123, "text", {}, [], [null],
    [{ path: "test/pomelo-z.test.ts" }],
    [{ path: null, addedLines: [{ line: 1, text: sample("ok", "true") }] }],
    [{ path: "test/pomelo-z.test.ts", addedLines: [null, { line: -1, text: sample("ok", "true") }, { line: 1, text: null }, { text: sample("ok", "true") }] }],
  ]) {
    assert.doesNotThrow(() => findAlwaysTrueChecks(input));
    assert.deepEqual(findAlwaysTrueChecks(input), { ok: true, findings: [] });
  }
});

test("recognizes valid assertions after an inline comment and handles whitespace", () => {
  const path = "test/pomelo-spaces.test.ts";
  assert.deepEqual(findAlwaysTrueChecks([file(path, 1,
    "const x = 1; /* explanation */ assert . ok ( true );",
    "assert.strict.equal(x, x);",
    "assert.ok(1n);",
    "assert.equal(a, a); // done",
  )]), { ok: false, findings: [
    finding(path, 1, "truthy-literal"),
    finding(path, 2, "same-value"),
    finding(path, 3, "truthy-literal"),
    finding(path, 4, "same-value"),
  ] });
});

test("does not treat regex literals as executed assertions", () => {
  const path = "test/pomelo-regex.test.ts";
  assert.deepEqual(findAlwaysTrueChecks([file(path, 3,
    "const value = /assert.ok(true)/;",
    "const second = /assert[.]notEqual(1, 2)/gi;",
    "const division = numerator / assert.ok(true);",
  )]), { ok: false, findings: [finding(path, 5, "truthy-literal")] });
});
