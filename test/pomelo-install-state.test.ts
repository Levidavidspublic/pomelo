import assert from "node:assert/strict";
import test from "node:test";
import { installState } from "../src/pomelo/install-state.js";

test("accepts a clean dependency report with an empty or absent problems list", () => {
  for (const report of [
    '{"dependencies":{"tsx":{"version":"4.23.13"}}}',
    '{"dependencies":{"tsx":{"version":"4.23.13"}},"problems":[]}',
  ]) {
    const result = installState(report);
    assert.equal(result.verdict, "ok");
    assert.deepEqual(result.problems, []);
    assert.match(result.summary, /^ok\b/);
  }
});

test("names a missing package and its required range", () => {
  const result = installState('{"dependencies":{"tsx":{"missing":true,"required":"^4.23.13"}}}');
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems, [{ name: "tsx", kind: "missing", wanted: "^4.23.13" }]);
  assert.match(result.summary, /^reinstall\b/);
});

test("reports the wanted and found versions for an invalid package", () => {
  const result = installState(
    '{"dependencies":{"react":{"invalid":true,"required":"^19.3.0","version":"18.0.0"}}}',
  );
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems, [
    { name: "react", kind: "invalid", wanted: "^19.3.0", found: "18.0.0" },
  ]);
});

test("uses a string invalid flag as the wanted text when required is absent", () => {
  const result = installState('{"dependencies":{"react":{"invalid":"^19.3.0","version":"18.0.0"}}}');
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems, [
    { name: "react", kind: "invalid", wanted: "^19.3.0", found: "18.0.0" },
  ]);
});

test("names an extraneous package and its installed version", () => {
  const result = installState('{"dependencies":{"leftover":{"extraneous":true,"version":"1.0.0"}}}');
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems, [{ name: "leftover", kind: "extraneous", found: "1.0.0" }]);
});

test("reinstalls on top-level problems even without a flagged dependency", () => {
  const result = installState(
    '{"dependencies":{"tsx":{"version":"4.23.13"}},"problems":["an unresolved dependency"]}',
  );
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems, []);
  assert.match(result.summary, /^reinstall\b/);
});

test("finds a flagged dependency two levels down and ignores non-string version details", () => {
  const result = installState(`{
    "dependencies": {"outer": {"dependencies": {"middle": {"dependencies": {
      "inner": {"invalid": true, "required": 2, "version": {"major": 1}}
    }}}}}
  }`);
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems, [{ name: "inner", kind: "invalid" }]);
});

test("lists the same flagged package only once", () => {
  const result = installState(`{
    "dependencies": {
      "left": {"dependencies": {"shared": {"missing": true, "required": "^1.0.0"}}},
      "right": {"dependencies": {"shared": {"missing": true, "required": "^1.0.0"}}}
    }
  }`);
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems, [{ name: "shared", kind: "missing", wanted: "^1.0.0" }]);
});

test("sorts before retaining 50 problems and reports how many remain", () => {
  const names = Array.from({ length: 60 }, (_, i) => `pkg-${String(i).padStart(2, "0")}`);
  const entries = [...names].reverse().map((name) => `"${name}":{"missing":true}`);
  const result = installState(`{"dependencies":{${entries.join(",")}}}`);
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems.map(({ name }) => name), names.slice(0, 50));
  assert.match(result.summary, /\b10 more\b/);
});

test("stops with a reason when the report is empty, broken, or missing dependencies", () => {
  for (const [report, reason] of [
    ["", /empty/],
    ["  \n", /empty/],
    ["null", /object/],
    ["[]", /object/],
    ["{}", /dependencies/],
    ['{"dependencies":{}}', /dependencies/],
    ['{"dependencies":[]}', /dependencies/],
    ['{"dependencies":', /JSON/],
    ['{"dependencies":{"tsx":null}}', /dependency/],
    ['{"dependencies":{"tsx":{"dependencies":[]}}}', /nested dependencies/],
    ['{"dependencies":{"tsx":{}},"problems":"unknown"}', /problems/],
    ['{"dependencies":{"tsx":{}},"error":{"code":"EUNKNOWN"}}', /error/],
  ] as const) {
    const result = installState(report);
    assert.equal(result.verdict, "stop", report);
    assert.deepEqual(result.problems, [], report);
    assert.match(result.summary, /^stop\b/, report);
    assert.match(result.summary, reason, report);
  }
});

test("stops when the dependency tree exceeds the inspection limit", () => {
  const level = '{"dependencies":{"deep":';
  const report = level.repeat(1000) + '{}' + '}}'.repeat(1000);
  const result = installState(report);
  assert.equal(result.verdict, "stop");
  assert.match(result.summary, /deep/);
});

test("preserves odd package names as data", () => {
  const result = installState('{"dependencies":{"@fixture/odd $[name]; &":{"missing":true}}}');
  assert.equal(result.verdict, "reinstall");
  assert.deepEqual(result.problems, [{ name: "@fixture/odd $[name]; &", kind: "missing" }]);
});
