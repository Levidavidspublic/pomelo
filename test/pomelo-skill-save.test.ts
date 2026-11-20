import assert from "node:assert/strict";
import test from "node:test";
import { skillSaveDecision, type SkillSaveInput } from "../src/pomelo/browser/skill-save.js";

const finished = {
  jobState: "done",
  askedBy: "amit",
  steps: [{ index: 1, kind: "open" }, { index: 2, kind: "read" }],
} as const satisfies SkillSaveInput;

test("Amit can save a finished browser job with plain steps", () => {
  const result = skillSaveDecision(finished);
  assert.equal(result.decision, "save");
  assert.deepEqual(result.steps, []);
});

test("a save requested by an agent needs Amit's confirmation", () => {
  const result = skillSaveDecision({ ...finished, askedBy: "agent" });
  assert.equal(result.decision, "ask");
  assert.match(result.reason, /Amit.*confirm/);
  assert.deepEqual(result.steps, []);
});

for (const [jobState, reason] of [
  ["failed", /failed/],
  ["cancelled", /cancelled/],
  ["waiting", /waiting/],
  ["running", /running/],
  ["queued", /queued/],
] as const) {
  test(`a ${jobState} browser job cannot be saved`, () => {
    const result = skillSaveDecision({ ...finished, jobState, askedBy: "agent" });
    assert.equal(result.decision, "refuse");
    assert.match(result.reason, reason);
    assert.deepEqual(result.steps, []);
  });
}

test("a finished browser job needs at least one step", () => {
  const result = skillSaveDecision({ ...finished, steps: [] });
  assert.equal(result.decision, "refuse");
  assert.match(result.reason, /no steps/);
  assert.deepEqual(result.steps, []);
});

for (const [heldFor, reason] of [
  ["captcha", /CAPTCHA/],
  ["one-time-code", /one-time code/],
  ["sign-in", /sign-in box/],
  ["certificate-warning", /certificate warning/],
  ["risky-click", /risky click/],
] as const) {
  test(`a step held for ${heldFor} needs Amit on every run`, () => {
    const result = skillSaveDecision({
      ...finished,
      steps: [...finished.steps, { index: 7, kind: "click", heldFor }],
    });
    assert.equal(result.decision, "ask");
    assert.match(result.reason, reason);
    assert.match(result.reason, /step 7/i);
    assert.match(result.reason, /Amit.*every run/);
    assert.deepEqual(result.steps, [7]);
  });
}

test("an agent request names every held step in order as well as asking Amit to confirm", () => {
  const result = skillSaveDecision({
    ...finished,
    askedBy: "agent",
    steps: [
      { index: 3, kind: "open", heldFor: "certificate-warning" },
      { index: 4, kind: "read" },
      { index: 9, kind: "click", heldFor: "risky-click" },
      { index: 12, kind: "read", heldFor: "captcha" },
    ],
  });
  assert.equal(result.decision, "ask");
  assert.match(result.reason, /Amit.*confirm/);
  assert.match(result.reason, /step 3.*certificate warning.*step 9.*risky click.*step 12.*CAPTCHA/i);
  assert.deepEqual(result.steps, [3, 9, 12]);
});

test("a step that ran with masking off rules out saving even when another step needs confirmation", () => {
  const result = skillSaveDecision({
    ...finished,
    askedBy: "agent",
    steps: [
      { index: 1, kind: "read", heldFor: "one-time-code" },
      { index: 5, kind: "read", maskOff: true },
    ],
  });
  assert.equal(result.decision, "refuse");
  assert.match(result.reason, /step 5.*masking off/i);
  assert.deepEqual(result.steps, [5]);
});

test("an unknown job state is refused without being echoed", () => {
  const jobState = "constructor" as SkillSaveInput["jobState"];
  const result = skillSaveDecision({ ...finished, jobState });
  assert.equal(result.decision, "refuse");
  assert.match(result.reason, /unknown state/);
  assert.doesNotMatch(result.reason, /constructor/);
  assert.deepEqual(result.steps, []);
});

test("the result never copies step content", () => {
  const canary = ["sample", "skill", "canary"].join("-");
  const step = {
    index: 6,
    kind: "click",
    heldFor: "risky-click",
    text: canary,
    url: `https://example.test/?query=${canary}`,
    value: canary,
    refPath: `op://example/item/${canary}`,
  } as const;
  const result = skillSaveDecision({ ...finished, steps: [step] });
  assert.equal(result.decision, "ask");
  assert.equal(JSON.stringify(result).includes(canary), false);
});
