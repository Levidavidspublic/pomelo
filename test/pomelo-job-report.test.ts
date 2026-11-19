import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserJob, BrowserProfile } from "../src/pomelo/browser-records.js";
import { jobReport } from "../src/pomelo/browser/job-report.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";
import { HIDDEN } from "../src/secrets.js";

const profile: BrowserProfile = {
  id: "profile-1",
  name: "Research\r\nbrowser\u2028profile",
  location: "cloud",
  cdpUrlName: "TEST_BROWSER_URL",
  encryptedAtRest: true,
};

const job: BrowserJob = {
  id: "job-1",
  threadId: "thread-1",
  laneId: "lane-1",
  profileId: profile.id,
  state: "done",
  steps: ["Opened page.", "Read the summary."],
  resourceLock: null,
};

const output = { endedAt: 200, result: "Found three options." };

test("a done cloud job reports the VPS, final step and result to its thread", () => {
  assert.deepEqual(jobReport(job, profile, output), {
    report: {
      threadId: "thread-1",
      laneId: "lane-1",
      jobId: "job-1",
      kind: "browser_job_result",
      status: "done",
      where: "VPS",
      headline: "Research browser profile · VPS: done",
      lastStep: "Read the summary.",
      body: "Found three options.",
      cut: false,
      stepCount: 2,
      at: 200,
    },
  });
});

test("failed and cancelled local jobs never say done in the headline", () => {
  const localProfile = { ...profile, location: "local", name: "Review Done items" } as const;
  for (const state of ["failed", "cancelled"] as const) {
    const result = jobReport({ ...job, state }, localProfile, output);
    assert.ok("report" in result);
    assert.equal(result.report.where, "This PC");
    assert.equal(result.report.status, state);
    assert.equal(result.report.headline, `Review items · This PC: ${state}`);
    assert.doesNotMatch(result.report.headline, /\bdone\b/i);
  }
});

test("unfinished browser jobs are refused", () => {
  for (const state of ["running", "queued", "waiting"] as const) {
    assert.ok("error" in jobReport({ ...job, state }, profile, output));
  }
});

test("missing IDs, a mismatched profile and non-finite end times are refused", () => {
  assert.ok("error" in jobReport({ ...job, id: "" }, profile, output));
  assert.ok("error" in jobReport({ ...job, threadId: " " }, profile, output));
  assert.ok("error" in jobReport(job, { ...profile, id: "other-profile" }, output));
  for (const endedAt of [NaN, Infinity, -Infinity]) {
    assert.ok("error" in jobReport(job, profile, { ...output, endedAt }));
  }
});

test("an empty result and no stored steps use the fallback body and empty last step", () => {
  for (const text of ["", " \t\n "]) {
    const result = jobReport({ ...job, steps: [] }, profile, { endedAt: 0, result: text });
    assert.ok("report" in result);
    assert.equal(result.report.body, "No result text.");
    assert.equal(result.report.lastStep, "");
    assert.equal(result.report.stepCount, 0);
    assert.equal(result.report.cut, false);
    assert.equal(result.report.at, 0);
  }
});

test("the report caps the body at 2000 characters without splitting a Unicode code point", () => {
  const exact = "a".repeat(1999) + "📚";
  const atLimit = jobReport(job, profile, { ...output, result: exact });
  assert.ok("report" in atLimit);
  assert.equal(atLimit.report.body, exact);
  assert.equal(atLimit.report.cut, false);

  const overLimit = jobReport(job, profile, { ...output, result: exact + "b" });
  assert.ok("report" in overLimit);
  assert.equal(overLimit.report.body, exact);
  assert.equal(overLimit.report.cut, true);
});

test("the report hides the canary in the profile name, last step and result before truncation", () => {
  const prefix = "gh" + "p_";
  const canary = prefix + "sample0".repeat(6);
  const masked = `${prefix}…${HIDDEN}`;
  const padding = "a".repeat(1970);
  const result = jobReport(
    { ...job, steps: ["Opened page.", `Read ${canary}`] },
    { ...profile, name: `Research\n${canary}` },
    { ...output, result: `${padding} ${canary}` },
  );
  assert.ok("report" in result);
  assertNoCanary(canary, { report: JSON.stringify(result.report) });
  assert.equal(result.report.headline, `Research ${masked} · VPS: done`);
  assert.equal(result.report.lastStep, `Read ${masked}`);
  assert.equal(result.report.body, `${padding} ${masked}`);
  assert.equal(result.report.cut, false);
  assert.equal("cdpUrlName" in result.report, false);
});
