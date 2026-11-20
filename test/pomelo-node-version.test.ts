import assert from "node:assert/strict";
import test from "node:test";
import { checkNodeVersion } from "../src/pomelo/node-version.js";

function manifest(range: string): string {
  return JSON.stringify({ engines: { node: range } });
}

test("accepts Node 22 and newer against Friday's minimum", () => {
  for (const version of ["v22.0.0", "v22.3.0", "v24.0.0"]) {
    const result = checkNodeVersion(version, manifest(">=22"));
    assert.equal(result.verdict, "ok", version);
    assert.equal(result.found, version);
    assert.equal(result.wanted, ">=22");
  }
});

test("reports an older Node and names both versions", () => {
  const result = checkNodeVersion("v20.11.1", manifest(">=22"));
  assert.equal(result.verdict, "too-old");
  assert.equal(result.found, "v20.11.1");
  assert.equal(result.wanted, ">=22");
  assert.match(result.reason, /v20\.11\.1/);
  assert.match(result.reason, />=22/);
});

test("compares minor and patch numbers for a full minimum", () => {
  assert.equal(checkNodeVersion("v22.0.0", manifest(">=22.4.0")).verdict, "too-old");
  assert.equal(checkNodeVersion("v22.4.9", manifest(">=22.4.10")).verdict, "too-old");
  assert.equal(checkNodeVersion("v22.4.10", manifest(">=22.4.10")).verdict, "ok");
  assert.equal(checkNodeVersion("v22.10.0", manifest(">=22.4.10")).verdict, "ok");
});

test("requires the specified major for caret and wildcard ranges", () => {
  for (const range of ["^22", "22.x"]) {
    assert.equal(checkNodeVersion("v22.5.1", manifest(range)).verdict, "ok", range);
    assert.equal(checkNodeVersion("v21.9.0", manifest(range)).verdict, "too-old", range);
    assert.equal(checkNodeVersion("v23.0.0", manifest(range)).verdict, "too-old", range);
  }
});

test("trims the command output and the Node range", () => {
  const result = checkNodeVersion("  v22.3.0 \r\n", ` ${manifest(" >=22 ")}\n`);
  assert.equal(result.verdict, "ok");
  assert.equal(result.found, "v22.3.0");
  assert.equal(result.wanted, ">=22");
});

test("reports empty and malformed Node version output as unreadable", () => {
  for (const version of ["", " \n", "v22", "v22.3.0-extra", "v022.3.0", "v22.3.0\nv24.0.0"]) {
    const result = checkNodeVersion(version, manifest(">=22"));
    assert.equal(result.verdict, "unreadable", JSON.stringify(version));
    assert.match(result.reason, /node --version/);
  }
});

test("reports invalid JSON separately from missing or invalid engines.node", () => {
  const invalidJson = checkNodeVersion("v22.3.0", "this is not JSON");
  assert.equal(invalidJson.verdict, "unreadable");
  assert.match(invalidJson.reason, /JSON/);

  for (const json of ["{}", "null", '{"engines":null}', '{"engines":{}}', '{"engines":{"node":22}}', manifest(" ")]) {
    const result = checkNodeVersion("v22.3.0", json);
    assert.equal(result.verdict, "unreadable", json);
    assert.match(result.reason, /engines\.node/);
  }
});

test("reports unsupported ranges as unreadable", () => {
  for (const range of [">=22 <25 || 30", ">=22.4", "^22.4.0", "22.*", ">=022", ">=9007199254740992"]) {
    const result = checkNodeVersion("v24.0.0", manifest(range));
    assert.equal(result.verdict, "unreadable", range);
    assert.match(result.reason, /range/);
  }
});
