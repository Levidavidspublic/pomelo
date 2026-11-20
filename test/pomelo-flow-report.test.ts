import assert from "node:assert/strict";
import test from "node:test";
import { flowReport } from "../src/pomelo/flow-report.js";
import { checkPhaseExit } from "../src/pomelo/phase-exit.js";

const noFlows = { F1: false, F2: false, F3: false, F4: false, F5: false, F6: false, F7: false, F8: false };
const flowIds = Object.keys(noFlows);
const passed = { status: "expected", results: [{ status: "passed", retry: 0 }] };

function spec(title: string, ...tests: unknown[]) {
  return { title, tests };
}

function report(...specs: ReturnType<typeof spec>[]) {
  return JSON.stringify({ suites: [{ specs }] });
}

function phaseOneReport() {
  return report(
    spec("[F8] renders a chart", passed),
    spec("F2: groups threads", passed),
    spec("F1: opens a thread", passed),
    spec("[F1] opens a sub-agent", passed),
  );
}

test("only flows with clean passes count, and flow IDs stay in order", () => {
  const result = flowReport(phaseOneReport());
  assert.deepEqual(result.flows, { ...noFlows, F1: true, F2: true, F8: true });
  assert.deepEqual(Object.keys(result.flows), flowIds);
  assert.deepEqual(result.missing, ["F3", "F4", "F5", "F6", "F7"]);
  assert.ok(result.reasons.some((reason) => /F3.*no.*test/i.test(reason)));
});

test("the reported flow map satisfies the Phase 1 exit rule directly", () => {
  const { flows } = flowReport(phaseOneReport());
  assert.deepEqual(checkPhaseExit(1, { flows, agentToolCallsMocked: false }), { ok: true, missing: [] });
});

test("skipped tests and tests without attempts do not count", () => {
  const result = flowReport(report(
    spec("F1: opens a thread", passed, { status: "skipped", results: [{ status: "skipped", retry: 0 }] }),
    spec("F2: groups threads", { status: "expected", results: [] }),
    spec("F3: imports a profile", { status: "expected", results: [{ status: "skipped", retry: 0 }] }),
    spec("F4: fills a form", { ...passed, expectedStatus: "skipped" }),
    spec("F5: runs a job", { ...passed, annotations: [{ type: "fixme" }] }),
  ));
  assert.deepEqual(result.flows, noFlows);
  assert.ok(result.reasons.some((reason) => /F1.*skipped/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /F2.*did not run/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /F3.*skipped/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /F4.*skipped/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /F5.*skipped/i.test(reason)));
});

test("retry-only passes and tests marked flaky do not count", () => {
  const result = flowReport(report(
    spec("F1: opens a thread", {
      status: "expected",
      results: [{ status: "failed", retry: 0 }, { status: "passed", retry: 1 }],
    }),
    spec("[F2] groups threads", { status: "flaky", results: [{ status: "passed", retry: 0 }] }),
    spec("F8: renders a chart", { status: "expected", results: [{ status: "passed", retry: 1 }] }),
  ));
  assert.deepEqual(result.flows, noFlows);
  assert.ok(result.reasons.some((reason) => /F1.*retry/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /F2.*flaky/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /F8.*retry/i.test(reason)));
});

test("one failing test blocks its flow even if later tests pass", () => {
  const failed = { status: "unexpected", results: [{ status: "failed", retry: 0 }] };
  const result = flowReport(report(
    spec("F1: opens a thread", failed),
    spec("[F1] opens a sub-agent", passed),
    spec("F2: groups threads", passed),
  ));
  assert.deepEqual(result.flows, { ...noFlows, F2: true });
  assert.deepEqual(result.missing, ["F1", "F3", "F4", "F5", "F6", "F7", "F8"]);
  assert.ok(result.reasons.some((reason) => /F1.*failed/i.test(reason)));
});

test("an expected failure is not a passing test", () => {
  const result = flowReport(report(
    spec("F1: opens a thread", { status: "expected", expectedStatus: "failed", results: [{ status: "failed", retry: 0 }] }),
    spec("F2: groups threads", { status: "unexpected", results: [{ status: "passed", retry: 0 }] }),
  ));
  assert.deepEqual(result.flows, noFlows);
});

test("only tags at the start of a spec title count, including in nested suites", () => {
  const result = flowReport(JSON.stringify({
    suites: [{
      title: "F3: suite title",
      specs: [spec("checks [F4] later in the title", passed), spec("F10: unrelated test", passed)],
      suites: [{
        specs: [],
        suites: [{ specs: [
          spec("[F5] runs a job", passed),
          spec("opens a page", { status: "unexpected", results: [{ status: "failed", retry: 0 }] }),
        ] }],
      }],
    }],
  }));
  assert.deepEqual(result.flows, { ...noFlows, F5: true });
});

test("broken JSON and non-string inputs give no flows and a reason", () => {
  for (const input of ["{\"suites\":", JSON.parse(phaseOneReport()), null]) {
    const result = flowReport(input);
    assert.deepEqual(result.flows, noFlows);
    assert.deepEqual(result.missing, flowIds);
    assert.ok(result.reasons.some((reason) => /JSON/i.test(reason)));
  }
});

test("empty reports and reports with zero tests give no flows and a reason", () => {
  for (const input of ["", "{}", JSON.stringify({ suites: [] }), report(spec("F1: opens a thread"))]) {
    const result = flowReport(input);
    assert.deepEqual(result.flows, noFlows);
    assert.deepEqual(result.missing, flowIds);
    assert.ok(result.reasons.length > 0);
    if (input.includes("suites")) assert.match(result.reasons[0], /no tests/i);
  }
});
