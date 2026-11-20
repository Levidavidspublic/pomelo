import assert from "node:assert/strict";
import test from "node:test";
import { DYNAMIC_LOAD_RULES, dynamicLoadGuard } from "../src/pomelo/dynamic-load.js";

const server = "src/pomelo/loader.ts";
const client = "src/client/pomelo/worker.ts";

function changed(path: string, ...lines: string[]) {
  return { path, added: lines.map((text, index) => ({ line: index + 1, text })) };
}

test("reports each dynamic load with its path, added line, rule, and reason", () => {
  const findings = dynamicLoadGuard([changed(server,
    "const plugin = await import(path);",
    'const plugin = require("./plugins/" + name);',
    "const load = createRequire(import.meta.url);",
    'module.register("./hooks.js", import.meta.url);',
    "const url = import.meta.resolve(path);",
    'new Worker(new URL("./workers/" + name, import.meta.url));',
    "new SharedWorker(workerPath, options);",
    "vm.runInNewContext(source);",
    "vm.runInThisContext(source);",
    "new vm.Script(source);",
  )]);

  assert.deepEqual(findings.map(({ path, line, rule }) => ({ path, line, rule })), [
    { path: server, line: 1, rule: "dynamic-import" },
    { path: server, line: 2, rule: "dynamic-require" },
    { path: server, line: 3, rule: "create-require" },
    { path: server, line: 4, rule: "module-register" },
    { path: server, line: 5, rule: "dynamic-resolve" },
    { path: server, line: 6, rule: "dynamic-worker" },
    { path: server, line: 7, rule: "dynamic-worker" },
    { path: server, line: 8, rule: "vm-run-in" },
    { path: server, line: 9, rule: "vm-run-in" },
    { path: server, line: 10, rule: "vm-script" },
  ]);
  assert.deepEqual(new Set(findings.map(({ rule }) => rule)), new Set(DYNAMIC_LOAD_RULES));
  for (const { reason } of findings) assert.match(reason, /\S/);
});

test("allows literal loaders and workers with a literal URL and optional worker options", () => {
  assert.deepEqual(dynamicLoadGuard([changed(client,
    'import("./a.js");',
    'require("node:path");',
    "import.meta.resolve('./a.js');",
    'new Worker(new URL("./w.js", import.meta.url));',
    'new Worker("./w.js", workerOptions);',
    'new SharedWorker(new URL("./w.js", import.meta.url), workerOptions);',
    'import( /* specifier */ "./escaped\\\"name.js", );',
    'new Worker(new URL("./w).js", import.meta.url,), { name: makeName() });',
  )]), []);
});

test("rejects template paths and worker URLs with a computed path or base", () => {
  const findings = dynamicLoadGuard([changed(client,
    'import(`./${name}.js`);',
    'require(`./a.js`);',
    'new Worker(new URL("./w.js", base));',
    'new SharedWorker(new URL(`./${name}.js`, import.meta.url));',
    'new Worker(new URL("./w.js", import.meta.url).href);',
    'require("./a.js", other);',
  )]);
  assert.deepEqual(findings.map(({ line }) => line), [1, 2, 3, 4, 5, 6]);
});

test("ignores comments, strings and unrelated calls but checks executable template expressions", () => {
  const findings = dynamicLoadGuard([changed(server,
    "// import(path);",
    "/* require(path);",
    "createRequire(path); */ import(actualPath);",
    'const hint = "try import(path) or require(\\\"built\\\")";',
    'const hint2 = `require(path)`;',
    'const hint3 = `require(path) ${ready ? `${import(actualPath)}` : ""}`;',
    'const example = /require(path)/;',
    "const method = obj.require(path);",
    "const name = recreateRequire(path);",
    "const other = vm.runInContextElsewhere(source);",
    "eval(source); new Function(source); require('node:child_process');",
  )]);
  assert.deepEqual(findings.map(({ line, rule }) => ({ line, rule })), [
    { line: 3, rule: "dynamic-import" },
    { line: 6, rule: "dynamic-import" },
  ]);
});

test("joins consecutive added lines and reports the line where the call begins", () => {
  const findings = dynamicLoadGuard([changed(client,
    'import(',
    '  "./allowed.js",',
    ');',
    'new SharedWorker /* comment */',
    '  (new URL("./w.js", makeBase()), options);',
    'import.meta',
    '  .resolve(',
    '    path,',
    '  );',
  )]);
  assert.deepEqual(findings.map(({ line, rule }) => ({ line, rule })), [
    { line: 4, rule: "dynamic-worker" },
    { line: 6, rule: "dynamic-resolve" },
  ]);
});

test("ignores Friday code, test files, and exact allow-listed paths", () => {
  const load = "import(path);";
  const findings = dynamicLoadGuard([
    changed("src/runner/worker.ts", load),
    changed("src/pomelo-extra/worker.ts", load),
    changed("test/worker.test.ts", load),
    changed("src/pomelo/worker.test.ts", load),
    changed("src/client/pomelo/__tests__/worker.ts", load),
    changed(server, load),
    changed(client, load),
  ], [server]);
  assert.deepEqual(findings.map(({ path }) => path), [client]);
});

test("sorts by path, numeric line and rule, and reports each rule once per line", () => {
  const findings = dynamicLoadGuard([{
    path: server,
    added: [
      { line: 10, text: "require(path); import(path); import(otherPath);" },
      { line: 2, text: "import(path);" },
    ],
  }, changed(client, "new Worker(path);")]);

  assert.deepEqual(findings.map(({ path, line, rule }) => ({ path, line, rule })), [
    { path: client, line: 1, rule: "dynamic-worker" },
    { path: server, line: 2, rule: "dynamic-import" },
    { path: server, line: 10, rule: "dynamic-import" },
    { path: server, line: 10, rule: "dynamic-require" },
  ]);
});
