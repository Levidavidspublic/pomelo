import assert from "node:assert/strict";
import test from "node:test";
import { lockfileSync } from "../src/pomelo/lockfile-sync.js";

function check(
  manifest: object,
  root: object,
  entries: Record<string, object>,
  lockfileVersion = 3,
) {
  const packages = { "": root, ...entries };
  return lockfileSync(JSON.stringify(manifest), JSON.stringify({ lockfileVersion, packages }));
}

test("accepts matching direct dependencies and allows hoisted transitive packages", () => {
  const manifest = {
    dependencies: { regular: "^1.2.3" },
    devDependencies: { "@fixture/dev": "~2.3.4" },
    optionalDependencies: { optional: "3.0.0" },
  };
  for (const lockfileVersion of [2, 3]) {
    assert.deepEqual(check(manifest, manifest, {
      "node_modules/regular": { version: "1.10.0", dependencies: { transitive: "^1.0.0" } },
      "node_modules/@fixture/dev": { version: "2.3.10" },
      "node_modules/optional": { version: "3.0.0", optional: true },
      "node_modules/transitive": { version: "1.0.1" },
    }, lockfileVersion), { verdict: "go", problems: [] });
  }
});

test("accepts a package with no dependencies and an empty packages map", () => {
  assert.deepEqual(lockfileSync("{}", '{"lockfileVersion":3,"packages":{}}'), {
    verdict: "go",
    problems: [],
  });
});

test("reports missing root declarations and missing installations sorted by package name", () => {
  const result = check({
    dependencies: { zebra: "^1.0.0", apple: "~2.0.0" },
    optionalDependencies: { melon: "3.0.0" },
  }, {
    dependencies: { zebra: "^1.0.0", carrot: "^4.0.0" },
    optionalDependencies: { melon: "3.0.0" },
  }, {
    "node_modules/apple": { version: "2.0.1" },
    "node_modules/carrot": { version: "4.0.1" },
    "node_modules/transitive/node_modules/zebra": { version: "1.0.1" },
  });
  assert.deepEqual(result, {
    verdict: "stop",
    problems: [
      { name: "apple", kind: "missing-from-lock", wanted: "~2.0.0" },
      { name: "carrot", kind: "missing-from-package", locked: "^4.0.0" },
      { name: "melon", kind: "missing-from-lock", wanted: "3.0.0" },
      { name: "zebra", kind: "missing-from-lock", wanted: "^1.0.0" },
    ],
  });
});

test("reports a stale root range even when the installed version satisfies both ranges", () => {
  assert.deepEqual(check(
    { devDependencies: { tool: "^1.2.0" } },
    { devDependencies: { tool: "^1.1.0" } },
    { "node_modules/tool": { version: "1.3.0" } },
  ), {
    verdict: "stop",
    problems: [{ name: "tool", kind: "range-mismatch", wanted: "^1.2.0", locked: "^1.1.0" }],
  });
});

test("detects a dependency moved to a different declaration group", () => {
  const result = check(
    { dependencies: { tool: "^1.0.0" } },
    { devDependencies: { tool: "^1.0.0" } },
    { "node_modules/tool": { version: "1.0.1" } },
  );
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.problems.map(({ name, kind }) => ({ name, kind })), [
    { name: "tool", kind: "range-mismatch" },
  ]);
});

test("accepts the optional range when npm omits the overridden production declaration", () => {
  assert.deepEqual(check(
    { dependencies: { tool: "^1.0.0" }, optionalDependencies: { tool: "^2.0.0" } },
    { optionalDependencies: { tool: "^2.0.0" } },
    { "node_modules/tool": { version: "2.0.1", optional: true } },
  ), { verdict: "go", problems: [] });
});

test("checks the bounds of plain exact, caret, and tilde ranges", () => {
  for (const [wanted, locked, matches] of [
    ["1.2.3", "1.2.3", true],
    ["1.2.3", "1.2.4", false],
    ["^1.2.3", "1.2.2", false],
    ["^1.2.3", "2.0.0", false],
    ["^0.2.3", "0.2.4", true],
    ["^0.2.3", "0.3.0", false],
    ["^0.0.3", "0.0.4", false],
    ["~1.2.3", "1.2.10", true],
    ["~1.2.3", "1.3.0", false],
    ["^0.0", "0.0.9", true],
    ["^0.0", "0.1.0", false],
    ["~1.2", "1.3.0", false],
    ["^1.2.3", "1.3.0-beta.1", false],
    ["^1.2.3-beta.2", "1.2.3", true],
    ["^1.2.3-beta.2", "1.2.3-beta.10", true],
    ["^1.2.3-beta.2", "1.2.3-beta.1", false],
    ["1.2.3+build.1", "1.2.3+build.2", true],
  ] as const) {
    const manifest = { dependencies: { sample: wanted } };
    const result = check(manifest, manifest, { "node_modules/sample": { version: locked } });
    assert.deepEqual(result, matches
      ? { verdict: "go", problems: [] }
      : { verdict: "stop", problems: [{ name: "sample", kind: "range-mismatch", wanted, locked }] },
    `${wanted} with ${locked}`);
  }
});

test("compares other range forms by declaration text", () => {
  for (const wanted of ["latest", "https://example.com/sample.tgz", ">=3", "^3.0.0 || ^4.0.0", "workspace:*"]) {
    const manifest = { dependencies: { sample: wanted } };
    const entries = { "node_modules/sample": { version: "1.0.0" } };
    assert.deepEqual(check(manifest, manifest, entries), { verdict: "go", problems: [] });
    assert.deepEqual(check(manifest, { dependencies: { sample: "*" } }, entries), {
      verdict: "stop",
      problems: [{ name: "sample", kind: "range-mismatch", wanted, locked: "*" }],
    });
  }
  const workspace = { dependencies: { sample: "workspace:*" } };
  assert.deepEqual(check(workspace, workspace, {
    "node_modules/sample": { resolved: "packages/sample", link: true },
  }), { verdict: "go", problems: [] });
});

test("stops on invalid package.json input", () => {
  const lockfile = '{"lockfileVersion":3,"packages":{"":{}}}';
  for (const manifest of ["", "  \n", "{", "null", "[]", '{"dependencies":{"sample":1}}']) {
    assert.deepEqual(lockfileSync(manifest, lockfile), {
      verdict: "stop",
      problems: [{ name: "package.json", kind: "bad-input" }],
    }, manifest);
  }
});

test("stops on invalid package-lock.json input", () => {
  for (const lockfile of [
    "",
    "  \n",
    "{",
    '{"lockfileVersion":3}',
    '{"lockfileVersion":3,"packages":[]}',
    '{"lockfileVersion":3,"packages":{"":null}}',
    '{"lockfileVersion":1,"packages":{"":{}}}',
  ]) {
    assert.deepEqual(lockfileSync("{}", lockfile), {
      verdict: "stop",
      problems: [{ name: "package-lock.json", kind: "bad-input" }],
    }, lockfile);
  }
});
