import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTagLimit, type TagLimitInput, type TagLimits } from "../src/pomelo/tag-limit.js";

const hourMs = 60 * 60_000;
const now = 2 * hourMs;
const input: TagLimitInput = {
  threadTags: [],
  tag: "research",
  projectExists: false,
  newProjectsThisRun: 0,
  newProjectTimes: [],
  now,
};
const fullThread = ["notes", "design", "build", "review", "docs"];

function assertRefused(input: TagLimitInput, reason: string, message: RegExp, limits?: TagLimits): void {
  const result = checkTagLimit(input, limits);
  assert.equal(result.decision, "refuse");
  assert.equal(result.reason, reason);
  assert.match(result.message, message);
}

test("the first project tag is allowed", () => {
  assert.deepEqual(checkTagLimit(input), { decision: "allow" });
});

test("a tag already on a full thread is a no-op even when both creation limits are reached", () => {
  const tagged = {
    ...input,
    threadTags: fullThread,
    tag: fullThread[0],
    projectExists: true,
    newProjectsThisRun: 3,
    newProjectTimes: Array<number>(10).fill(now),
  };
  assert.deepEqual(checkTagLimit(tagged), { decision: "already" });
});

test("the fifth tag is allowed and the sixth is refused even for an existing project", () => {
  assert.deepEqual(checkTagLimit({ ...input, threadTags: fullThread.slice(1) }), { decision: "allow" });
  assertRefused({ ...input, threadTags: fullThread, projectExists: true }, "too_many_tags", /thread.*5 project tags/i);
});

test("adding an existing project tag uses neither new-project limit", () => {
  assert.deepEqual(checkTagLimit({
    ...input,
    projectExists: true,
    newProjectsThisRun: 3,
    newProjectTimes: Array<number>(10).fill(now),
  }), { decision: "allow" });
});

test("the run can create a third project but cannot create a fourth", () => {
  assert.deepEqual(checkTagLimit({ ...input, newProjectsThisRun: 2 }), { decision: "allow" });
  assertRefused({ ...input, newProjectsThisRun: 3 }, "too_many_per_run", /3 new projects.*this run/i);
});

test("the hourly cap uses a rolling window and frees a slot after an hour passes", () => {
  const nineRecent = Array<number>(9).fill(now);
  const newProjectTimes = Object.freeze([...nineRecent, now - hourMs]);
  assert.deepEqual(checkTagLimit({ ...input, newProjectTimes: nineRecent }), { decision: "allow" });
  assertRefused({ ...input, newProjectTimes }, "too_many_per_hour", /10 new projects.*last hour/i);
  assert.deepEqual(checkTagLimit({ ...input, newProjectTimes, now: now + 1 }), { decision: "allow" });
});

test("custom limits apply to tags, project creation in a run, and hourly project creation", () => {
  const limits = { maxTagsPerThread: 1, maxNewProjectsPerRun: 1, maxNewProjectsPerHour: 2 };
  assert.deepEqual(checkTagLimit(input, limits), { decision: "allow" });
  assertRefused({ ...input, threadTags: ["docs"] }, "too_many_tags", /1 project tag\b/i, limits);
  assertRefused({ ...input, newProjectsThisRun: 1 }, "too_many_per_run", /1 new project\b/i, limits);
  assertRefused({ ...input, newProjectTimes: [now, now - 1] }, "too_many_per_hour", /2 new projects/i, limits);
});

test("bad input gets a plain refusal", () => {
  for (const badInput of [
    undefined,
    { ...input, threadTags: undefined },
    { ...input, threadTags: [42] },
    { ...input, tag: " " },
    { ...input, projectExists: undefined },
    { ...input, newProjectsThisRun: -1 },
    { ...input, newProjectsThisRun: 1.5 },
    { ...input, newProjectTimes: undefined },
    { ...input, newProjectTimes: [Infinity] },
    { ...input, newProjectTimes: [now + 1] },
    { ...input, now: NaN },
    { ...input, now: Infinity },
  ]) {
    assertRefused(badInput as TagLimitInput, "bad_input", /\.$/);
  }
});

test("invalid custom limits get a plain refusal", () => {
  const limits = { maxTagsPerThread: -1, maxNewProjectsPerRun: 3, maxNewProjectsPerHour: 10 };
  assertRefused(input, "bad_input", /limits/i, limits);
});

test("Hebrew and English tag names follow the same rules", () => {
  for (const tag of ["research", "מחקר"]) {
    assert.deepEqual(checkTagLimit({ ...input, tag }), { decision: "allow" });
    assert.deepEqual(checkTagLimit({ ...input, tag, threadTags: [tag], projectExists: true }), { decision: "already" });
    assertRefused({ ...input, tag, threadTags: fullThread }, "too_many_tags", /thread.*5 project tags/i);
  }
});
