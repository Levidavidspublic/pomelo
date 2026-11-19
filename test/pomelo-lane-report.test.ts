import assert from "node:assert/strict";
import test from "node:test";
import { LANE_REPORT_LIMIT, laneReport } from "../src/pomelo/lane-report.js";
import { HIDDEN } from "../src/secrets.js";

const lane = {
  threadId: "parent",
  laneId: "worker",
  purpose: "research pricing",
  status: "done",
  endedAt: 200,
} as const;

test("a finished lane reports its result and end time to its parent thread", () => {
  assert.deepEqual(laneReport(lane, "  Compared three plans.\n"), {
    report: {
      threadId: "parent",
      laneId: "worker",
      kind: "subagent_result",
      status: "done",
      headline: "research pricing: done",
      body: "Compared three plans.",
      cut: false,
      at: 200,
    },
  });
});

test("failed and cancelled headlines give their final status on one line", () => {
  for (const status of ["failed", "cancelled"] as const) {
    const result = laneReport({ ...lane, purpose: "research\r\npricing\u2028options", status }, "Stopped early.");
    assert.ok("report" in result);
    assert.equal(result.report.status, status);
    assert.equal(result.report.headline, `research pricing options: ${status}`);

    const withDone = laneReport({ ...lane, purpose: "Review Done items", status }, "");
    assert.ok("report" in withDone);
    assert.doesNotMatch(withDone.report.headline, /\bdone\b/i);
  }
});

test("running lanes, missing end times and empty IDs return errors", () => {
  for (const input of [
    { ...lane, status: "running" },
    { ...lane, endedAt: undefined },
    { ...lane, threadId: "" },
    { ...lane, laneId: "" },
  ] as const) {
    const result = laneReport(input, "Some output.");
    assert.ok("error" in result && result.error.length > 0);
  }
});

test("an empty or whitespace-only result uses the fallback body", () => {
  for (const body of ["", " \t\n "]) {
    const result = laneReport({ ...lane, endedAt: 0 }, body);
    assert.ok("report" in result);
    assert.equal(result.report.body, "No result text.");
    assert.equal(result.report.cut, false);
    assert.equal(result.report.at, 0);
  }
});

test("the body is capped at 2000 characters without splitting a Unicode code point", () => {
  assert.equal(LANE_REPORT_LIMIT, 2000);
  const exact = "a".repeat(LANE_REPORT_LIMIT - 1) + "📚";
  const atLimit = laneReport(lane, exact);
  assert.ok("report" in atLimit);
  assert.equal(atLimit.report.body, exact);
  assert.equal(atLimit.report.cut, false);

  const overLimit = laneReport(lane, exact + "b");
  assert.ok("report" in overLimit);
  assert.equal(overLimit.report.body, exact);
  assert.equal(overLimit.report.cut, true);
});

test("the shield hides secrets in the headline and body before the body limit is applied", () => {
  const keyPrefix = "gh" + "p_";
  const keyCanary = keyPrefix + "sample0".repeat(6);
  const passwordCanary = "sample" + "-pass-0123";
  const padding = "a".repeat(LANE_REPORT_LIMIT - 30);
  const result = laneReport({ ...lane, purpose: `password=${passwordCanary}` }, `${padding} ${keyCanary}`);
  assert.ok("report" in result);
  assert.equal(result.report.headline, `password=${HIDDEN}: done`);
  assert.equal(result.report.body, `${padding} ${keyPrefix}…${HIDDEN}`);
  assert.equal(result.report.cut, false);
  assert.equal(JSON.stringify(result.report).includes(keyCanary), false);
  assert.equal(JSON.stringify(result.report).includes(passwordCanary), false);
});

test("Hebrew passes through in the purpose and result", () => {
  const purpose = "השוואת מחירים";
  const body = "נבדקו שלוש אפשרויות.";
  const result = laneReport({ ...lane, purpose }, body);
  assert.ok("report" in result);
  assert.equal(result.report.headline, `${purpose}: done`);
  assert.equal(result.report.body, body);
});
