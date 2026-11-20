import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReviewThreads } from "../src/pomelo/review-threads.js";

const reviewers = ["primary-reviewer", "fallback-reviewer"] as const;
const bodyMarker = "test comment body marker";
const comment = {
  author: { login: reviewers[0] },
  createdAt: "2026-11-19T10:00:00Z",
  body: bodyMarker,
};
const thread = {
  isResolved: false,
  isOutdated: false,
  path: "src/example.ts",
  line: 12,
  comments: { nodes: [comment] },
};
const settled = { ok: true, open: [], problems: [] };

function reviewJson(nodes: unknown[], hasNextPage = false): string {
  return JSON.stringify({ reviewThreads: { nodes, pageInfo: { hasNextPage } } });
}

test("no review threads pass", () => {
  assert.deepEqual(checkReviewThreads(reviewJson([]), reviewers), settled);
});

test("resolved threads pass even if they are outdated", () => {
  const resolved = { ...thread, isResolved: true };
  assert.deepEqual(checkReviewThreads(reviewJson([resolved, { ...resolved, isOutdated: true }]), reviewers), settled);
});

test("unresolved threads from either counted reviewer are named without their comment bodies", () => {
  const fallback = {
    ...thread,
    path: "src/other.ts",
    line: null,
    comments: { nodes: [{ ...comment, author: { login: "Fallback-Reviewer" } }] },
  };
  const result = checkReviewThreads(reviewJson([thread, fallback]), reviewers);
  assert.deepEqual(result, {
    ok: false,
    open: [
      { path: thread.path, line: thread.line, author: reviewers[0], reason: "Review thread is unresolved." },
      { path: fallback.path, line: null, author: "Fallback-Reviewer", reason: "Review thread is unresolved." },
    ],
    problems: [],
  });
  assert.equal(JSON.stringify(result).includes(bodyMarker), false);
});

test("an uncounted opener is ignored even when a counted reviewer replies", () => {
  const other = { ...comment, author: { login: "another-reviewer" } };
  const reply = { ...comment, createdAt: "2026-11-19T10:02:00Z" };
  assert.deepEqual(checkReviewThreads(reviewJson([{ ...thread, comments: { nodes: [other, reply] } }]), reviewers), settled);
});

test("an outdated thread settles only when its file changed after the opening comment", () => {
  const outdated = { ...thread, isOutdated: true };
  for (const fileChangedAt of [undefined, "unknown", "2026-11-31T10:00:00Z", "2026-11-19T09:59:59Z", comment.createdAt]) {
    const result = checkReviewThreads(reviewJson([{ ...outdated, fileChangedAt }]), reviewers);
    assert.deepEqual(result, {
      ok: false,
      open: [{
        path: thread.path,
        line: thread.line,
        author: reviewers[0],
        reason: "Outdated thread has no confirmed file change after its first comment.",
      }],
      problems: [],
    });
  }
  const fileChangedAt = "2026-11-19T11:00:01+01:00";
  assert.deepEqual(checkReviewThreads(reviewJson([{ ...outdated, fileChangedAt }]), reviewers), settled);
  assert.equal(checkReviewThreads(reviewJson([{ ...thread, fileChangedAt }]), reviewers).ok, false);
});

test("invalid JSON and a missing review threads list each give a reason", () => {
  const invalid = checkReviewThreads(`{"body":"${bodyMarker}"`, reviewers);
  assert.equal(invalid.ok, false);
  assert.match(invalid.problems.join(" "), /JSON/);
  assert.equal(JSON.stringify(invalid).includes(bodyMarker), false);

  const missing = checkReviewThreads('{"reviewThreads":{}}', reviewers);
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join(" "), /review threads list/i);
});

test("a paged review threads list blocks and still reports visible open threads", () => {
  for (const nodes of [[], [thread]]) {
    const result = checkReviewThreads(reviewJson(nodes, true), reviewers);
    assert.equal(result.ok, false);
    assert.match(result.problems.join(" "), /more pages/i);
    assert.equal(result.open.length, nodes.length);
  }
});

test("a raw GraphQL response uses the pull request's review threads and fails on response errors", () => {
  const pullRequest = { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } } };
  const data = { repository: { pullRequest } };
  assert.deepEqual(checkReviewThreads(JSON.stringify({ data }), reviewers), settled);
  const result = checkReviewThreads(JSON.stringify({ data, errors: [{ message: bodyMarker }] }), reviewers);
  assert.equal(result.ok, false);
  assert.match(result.problems.join(" "), /errors/i);
  assert.equal(JSON.stringify(result).includes(bodyMarker), false);
});

test("a missing opening comment author cannot silently pass", () => {
  const result = checkReviewThreads(reviewJson([{ ...thread, comments: { nodes: [] } }]), reviewers);
  assert.equal(result.ok, false);
  assert.match(result.problems.join(" "), /first comment.*author/i);
});
