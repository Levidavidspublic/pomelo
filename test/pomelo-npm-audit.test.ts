import assert from "node:assert/strict";
import { test } from "node:test";
import { npmAuditCheck } from "../src/pomelo/npm-audit.js";

test("allows a report with an empty vulnerabilities object", () => {
  const result = npmAuditCheck('{"vulnerabilities":{}}');

  assert.equal(result.verdict, "go");
  assert.deepEqual(result.findings, []);
  assert.equal(result.lower, 0);
});

test("holds for a critical direct dependency and names the package", () => {
  const result = npmAuditCheck(`{
    "vulnerabilities": {
      "@fixture/direct": {
        "severity": "critical", "isDirect": true, "fixAvailable": true,
        "via": [{ "severity": "critical" }], "range": "<2.0.0"
      }
    },
    "metadata": { "vulnerabilities": { "critical": 1, "total": 1 } }
  }`);

  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.findings, [
    { name: "@fixture/direct", severity: "critical", direct: true, fix: true },
  ]);
  assert.equal(result.lower, 0);
});

test("holds for a high indirect dependency without a fix", () => {
  const result = npmAuditCheck(`{
    "vulnerabilities": {
      "fixture-indirect": { "severity": "high", "isDirect": false, "fixAvailable": false }
    }
  }`);

  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.findings, [
    { name: "fixture-indirect", severity: "high", direct: false, fix: false },
  ]);
});

test("allows and counts moderate and low entries", () => {
  const result = npmAuditCheck(`{
    "vulnerabilities": {
      "fixture-moderate": { "severity": "moderate", "isDirect": true, "fixAvailable": true },
      "fixture-low": { "severity": "low", "isDirect": false, "fixAvailable": false }
    },
    "metadata": { "vulnerabilities": { "low": 1, "moderate": 1, "high": 0, "critical": 0, "total": 2 } }
  }`);

  assert.equal(result.verdict, "go");
  assert.deepEqual(result.findings, []);
  assert.equal(result.lower, 2);
});

test("allows informational entries and counts only moderate and low in lower", () => {
  const result = npmAuditCheck(`{
    "vulnerabilities": {
      "fixture-info": { "severity": "info", "isDirect": false, "fixAvailable": false }
    },
    "metadata": { "vulnerabilities": { "info": 1, "total": 1 } }
  }`);

  assert.equal(result.verdict, "go");
  assert.equal(result.lower, 0);
});

test("sorts critical findings first and orders each group by package name", () => {
  const result = npmAuditCheck(`{
    "vulnerabilities": {
      "z-high": { "severity": "high", "isDirect": true, "fixAvailable": true },
      "z-critical": { "severity": "critical", "isDirect": false, "fixAvailable": false },
      "a-high": { "severity": "high", "isDirect": false, "fixAvailable": false },
      "a-critical": { "severity": "critical", "isDirect": true, "fixAvailable": true },
      "a-low": { "severity": "low", "isDirect": true, "fixAvailable": true }
    }
  }`);

  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.findings.map(({ name }) => name), ["a-critical", "z-critical", "a-high", "z-high"]);
  assert.equal(result.lower, 1);
});

test("recognizes an object describing the available fix", () => {
  const result = npmAuditCheck(`{
    "vulnerabilities": {
      "fixture-child": {
        "severity": "high", "isDirect": false,
        "fixAvailable": { "name": "fixture-parent", "version": "2.0.0", "isSemVerMajor": true }
      }
    }
  }`);

  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.findings, [
    { name: "fixture-child", severity: "high", direct: false, fix: true },
  ]);
});

test("cannot tell from empty text or invalid JSON", () => {
  for (const jsonText of ["", "   ", "not JSON", '{"vulnerabilities":']) {
    const result = npmAuditCheck(jsonText);
    assert.equal(result.verdict, "unknown");
    assert.match(result.reason, /JSON/);
  }
});

test("cannot tell when npm includes an error field", () => {
  for (const jsonText of ['{"error":{"summary":"registry unavailable"}}', '{"error":null,"vulnerabilities":{}}']) {
    const result = npmAuditCheck(jsonText);
    assert.equal(result.verdict, "unknown");
    assert.match(result.reason, /error/i);
  }
});

test("cannot tell without a vulnerabilities object", () => {
  for (const jsonText of ["{}", "null", "[]", '{"vulnerabilities":null}', '{"vulnerabilities":[]}']) {
    const result = npmAuditCheck(jsonText);
    assert.equal(result.verdict, "unknown");
    assert.ok(result.reason);
  }
});

test("cannot tell when a vulnerability entry is malformed", () => {
  const malformedEntries = [
    null,
    [],
    {},
    { severity: "low", isDirect: "true", fixAvailable: false },
    { severity: "low", isDirect: false, fixAvailable: [] },
  ];
  for (const entry of malformedEntries) {
    const result = npmAuditCheck(JSON.stringify({ vulnerabilities: { "fixture-entry": entry } }));
    assert.equal(result.verdict, "unknown");
    assert.ok(result.reason);
  }
});

test("cannot tell when the summary claims findings missing from the report", () => {
  const result = npmAuditCheck(`{
    "vulnerabilities": {},
    "metadata": { "vulnerabilities": { "high": 1, "total": 1 } }
  }`);

  assert.equal(result.verdict, "unknown");
  assert.match(result.reason, /counts/i);
});

test("cannot tell when the supplied summary is malformed", () => {
  for (const metadata of [null, [], { vulnerabilities: false }, { vulnerabilities: { total: "0" } }]) {
    const result = npmAuditCheck(JSON.stringify({ vulnerabilities: {}, metadata }));
    assert.equal(result.verdict, "unknown");
    assert.ok(result.reason);
  }
});

test("holds for an unfamiliar severity and preserves it in the finding", () => {
  const result = npmAuditCheck(`{
    "vulnerabilities": {
      "fixture-unfamiliar": { "severity": "future", "isDirect": false, "fixAvailable": false }
    }
  }`);

  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.findings, [
    { name: "fixture-unfamiliar", severity: "future", direct: false, fix: false },
  ]);
  assert.equal(result.lower, 0);
});
