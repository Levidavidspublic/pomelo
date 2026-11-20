import assert from "node:assert/strict";
import { test } from "node:test";
import { mainHealth } from "../src/pomelo/main-red.js";

const green = {
  sha: "green",
  pr: 1,
  checks: [{ conclusion: "success" }, { conclusion: "success" }],
};
const red = {
  sha: "red",
  pr: 2,
  checks: [{ conclusion: "success" }, { conclusion: "failure" }],
};

test("go when every required check passes on the newest commit", () => {
  assert.deepEqual(mainHealth([green, red]), {
    verdict: "go",
    reason: "All required checks on main passed.",
    firstRedSha: null,
    firstRedPr: null,
  });
});

for (const conclusion of ["failure", "cancelled", "timed_out"]) {
  test(`stop on ${conclusion} even when another required check is pending`, () => {
    assert.deepEqual(mainHealth([{ ...red, checks: [{ conclusion: null }, { conclusion }] }]), {
      verdict: "stop",
      reason: "A required check on main failed, was cancelled, or timed out.",
      firstRedSha: red.sha,
      firstRedPr: red.pr,
    });
  });
}

test("name the oldest commit in three consecutive red commits", () => {
  const result = mainHealth([
    { ...red, sha: "newest", pr: 4 },
    { ...red, sha: "middle", pr: 3 },
    red,
  ]);
  assert.equal(result.verdict, "stop");
  assert.equal(result.firstRedSha, red.sha);
  assert.equal(result.firstRedPr, red.pr);
});

test("a green commit breaks the red run", () => {
  const newest = { ...red, sha: "newest", pr: 4 };
  const result = mainHealth([newest, green, red]);
  assert.equal(result.verdict, "stop");
  assert.equal(result.firstRedSha, newest.sha);
  assert.equal(result.firstRedPr, newest.pr);
});

test("a commit with pending results breaks the confirmed red run", () => {
  const newest = { ...red, sha: "newest", pr: 4 };
  const pending = { ...green, checks: [{ conclusion: null }] };
  const result = mainHealth([newest, pending, red]);
  assert.equal(result.verdict, "stop");
  assert.equal(result.firstRedSha, newest.sha);
  assert.equal(result.firstRedPr, newest.pr);
});

for (const [label, checks] of [
  ["running", [{ conclusion: "success" }, { conclusion: null }]],
  ["missing", [{ conclusion: "success" }, {}]],
  ["skipped", [{ conclusion: "success" }, { conclusion: "skipped" }]],
  ["neutral", [{ conclusion: "success" }, { conclusion: "neutral" }]],
  ["an empty check list", []],
] as const) {
  test(`wait for ${label} on the newest commit`, () => {
    assert.deepEqual(mainHealth([{ ...green, checks }, red]), {
      verdict: "wait",
      reason: "Main is still waiting for required checks to pass.",
      firstRedSha: null,
      firstRedPr: null,
    });
  });
}

test("wait when no commits are available", () => {
  assert.deepEqual(mainHealth([]), {
    verdict: "wait",
    reason: "Main is still waiting for required checks to pass.",
    firstRedSha: null,
    firstRedPr: null,
  });
});

test("a red commit without a PR still reports its SHA", () => {
  const result = mainHealth([{ ...red, pr: null }]);
  assert.equal(result.verdict, "stop");
  assert.equal(result.firstRedSha, red.sha);
  assert.equal(result.firstRedPr, null);
});
