import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scriptGuard } from "../src/pomelo/script-guard.js";

test("reports no changes for the same repository package.json", () => {
  const manifest = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  assert.deepEqual(scriptGuard(manifest, manifest), []);
});

test("blocks replacing the test script with exit 0", () => {
  assert.deepEqual(scriptGuard(
    '{"scripts":{"test":"node scripts/test.mjs"}}',
    '{"scripts":{"test":"exit 0"}}',
  ), [{ field: "scripts.test", change: "changed", level: "blocking" }]);
});

test("blocks removing the typecheck script with its scripts section", () => {
  assert.deepEqual(scriptGuard(
    '{"scripts":{"typecheck":"tsc --noEmit"}}',
    '{}',
  ), [{ field: "scripts.typecheck", change: "removed", level: "blocking" }]);
});

test("blocks adding a protected script", () => {
  assert.deepEqual(scriptGuard(
    '{}',
    '{"scripts":{"test":"node scripts/test.mjs"}}',
  ), [{ field: "scripts.test", change: "added", level: "blocking" }]);
});

test("marks a new script for review", () => {
  assert.deepEqual(scriptGuard(
    '{"scripts":{"test":"node scripts/test.mjs"}}',
    '{"scripts":{"test":"node scripts/test.mjs","lint":"node scripts/lint.mjs"}}',
  ), [{ field: "scripts.lint", change: "added", level: "review" }]);
});

test("marks a lowered Node engine for review", () => {
  assert.deepEqual(scriptGuard(
    '{"engines":{"node":">=22"}}',
    '{"engines":{"node":">=20"}}',
  ), [{ field: "engines.node", change: "changed", level: "review" }]);
});

test("reports entry point and script changes in field order", () => {
  assert.deepEqual(scriptGuard(
    '{"type":"module","bin":{"friday":"bin/friday.mjs"},"scripts":{"start":"node bin/friday.mjs","relay":"tsx src/relay-main.ts"}}',
    '{"main":"dist/main.mjs","bin":"bin/pomelo.mjs","scripts":{"start":"node bin/pomelo.mjs"}}',
  ), [
    { field: "bin", change: "changed", level: "review" },
    { field: "main", change: "added", level: "review" },
    { field: "scripts.relay", change: "removed", level: "review" },
    { field: "scripts.start", change: "changed", level: "review" },
    { field: "type", change: "removed", level: "review" },
  ]);
});

test("ignores changes to dependencies and other engines", () => {
  assert.deepEqual(scriptGuard(
    '{"dependencies":{"example":"1.0.0"},"devDependencies":{"fixture":"1.0.0"},"engines":{"node":">=22","npm":">=10"}}',
    '{"dependencies":{"example":"2.0.0"},"optionalDependencies":{"fixture":"1.0.0"},"engines":{"node":">=22","npm":">=11"}}',
  ), []);
});

test("ignores formatting and object key order, including inside bin", () => {
  assert.deepEqual(scriptGuard(
    '{"scripts":{"test":"node scripts/test.mjs","start":"node bin/friday.mjs"},"bin":{"friday":"bin/friday.mjs","helper":"bin/helper.mjs"}}',
    '{ "bin": {"helper":"bin/helper.mjs","friday":"bin/friday.mjs"}, "scripts": {"start":"node bin/friday.mjs","test":"node scripts/test.mjs"} }',
  ), []);
});

test("compares script names that also occur on Object.prototype", () => {
  assert.deepEqual(scriptGuard(
    '{"scripts":{"constructor":"node helper.mjs"}}',
    '{"scripts":{"__proto__":"node other.mjs"}}',
  ), [
    { field: "scripts.__proto__", change: "added", level: "review" },
    { field: "scripts.constructor", change: "removed", level: "review" },
  ]);
});

test("reports exactly one blocking finding that identifies unreadable input", () => {
  assert.deepEqual(scriptGuard('{', '{}'), [
    { field: "package.json (before)", change: "unreadable", level: "blocking" },
  ]);
  assert.deepEqual(scriptGuard('{}', '{"scripts":'), [
    { field: "package.json (after)", change: "unreadable", level: "blocking" },
  ]);
  assert.deepEqual(scriptGuard('[', '{'), [
    { field: "package.json (before and after)", change: "unreadable", level: "blocking" },
  ]);
  assert.deepEqual(scriptGuard('{}', 'null'), [
    { field: "package.json (after)", change: "unreadable", level: "blocking" },
  ]);
});
