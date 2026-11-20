import assert from "node:assert/strict";
import test from "node:test";
import { npmConfigCheck } from "../src/pomelo/npm-config.js";

test("accepts clean npm config with default and unset settings", () => {
  const result = npmConfigCheck(`{
    "registry": "https://registry.npmjs.org/",
    "@fixture:registry": "https://registry.npmjs.org/",
    "package-lock": true,
    "force": false,
    "legacy-peer-deps": false,
    "omit": ["optional"],
    "production": null,
    "strict-ssl": true,
    "proxy": null,
    "https-proxy": null,
    "script-shell": null
  }`);
  assert.deepEqual(result, { verdict: "go", problems: [] });
  assert.deepEqual(npmConfigCheck("{}"), { verdict: "go", problems: [] });
});

for (const [key, config] of [
  ["registry", '{"registry":"https://registry.example.invalid/"}'],
  ["@fixture:registry", '{"@fixture:registry":"https://registry.example.invalid/"}'],
  ["package-lock", '{"package-lock":false}'],
  ["force", '{"force":true}'],
  ["legacy-peer-deps", '{"legacy-peer-deps":true}'],
  ["omit", '{"omit":["optional","dev"]}'],
  ["production", '{"production":true}'],
  ["strict-ssl", '{"strict-ssl":false}'],
  ["proxy", '{"proxy":"http://proxy.example.invalid/"}'],
  ["https-proxy", '{"https-proxy":"https://proxy.example.invalid/"}'],
  ["script-shell", '{"script-shell":"/bin/bash"}'],
]) {
  test(`stops and names ${key} when it changes the kitchen setup`, () => {
    const result = npmConfigCheck(config);
    assert.equal(result.verdict, "stop");
    assert.deepEqual(result.problems.map((problem) => problem.key), [key]);
    assert.ok(result.problems[0].reason.trim());
  });
}

test("handles a single omit value and empty overrides", () => {
  assert.equal(npmConfigCheck('{"omit":"dev"}').problems[0]?.key, "omit");
  assert.deepEqual(npmConfigCheck('{"proxy":"","https-proxy":"","script-shell":""}'), {
    verdict: "go",
    problems: [],
  });
});

test("stops when the config is empty, invalid JSON, or not an object", () => {
  for (const [config, reason] of [
    ["", /empty/],
    ["  \n", /empty/],
    ['{"registry":', /JSON/],
    ["[]", /object/],
    ["null", /object/],
    ['"text"', /object/],
  ] as const) {
    const result = npmConfigCheck(config);
    assert.equal(result.verdict, "stop");
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0].reason, reason);
  }
});

test("reports all problems in key order regardless of input order", () => {
  const first = npmConfigCheck(
    '{"strict-ssl":false,"force":true,"@z:registry":"http://registry.npmjs.org/","@a:registry":null}',
  );
  const second = npmConfigCheck(
    '{"@a:registry":null,"@z:registry":"http://registry.npmjs.org/","force":true,"strict-ssl":false}',
  );
  assert.equal(first.verdict, "stop");
  assert.deepEqual(first.problems.map(({ key }) => key), ["@a:registry", "@z:registry", "force", "strict-ssl"]);
  assert.deepEqual(first, second);
});

test("keeps credential values and other config values out of the result", () => {
  const result = npmConfigCheck(`{
    "//registry.npmjs.org/:_authToken": "fixture-auth-marker",
    "vendorPassword": "fixture-password-marker",
    "_private": "fixture-private-marker",
    "proxy": "https://proxy.example.invalid/fixture-proxy-marker",
    "@auth:registry": "https://registry.example.invalid/fixture-registry-marker"
  }`);
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.problems.map(({ key }) => key), ["@auth:registry", "proxy"]);
  assert.doesNotMatch(JSON.stringify(result), /fixture-\w+-marker/);
});
