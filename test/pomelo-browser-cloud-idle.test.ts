import assert from "node:assert/strict";
import test from "node:test";
import { pickIdleCloudProfiles, type CloudIdleProfile } from "../src/pomelo/browser/cloud-idle.js";

const minute = 60_000;
const now = 1_000_000_000;

function profile(id: string, overrides: Partial<CloudIdleProfile> = {}): CloudIdleProfile {
  return {
    id, target: "cloud", open: true, lastActiveAt: now - 16 * minute,
    runningJobs: 0, waitingJobs: 0, queuedJobs: 0, liveGrants: 0,
    ...overrides,
  };
}

const keepCases = [
  ["not-cloud", { target: "local", open: false, lastActiveAt: now - 24 * 60 * minute }],
  ["already-closed", { open: false, runningJobs: 1 }],
  ["job-running", { runningJobs: 1, waitingJobs: 1 }],
  ["job-waiting", { waitingJobs: 1, queuedJobs: 1 }],
  ["job-queued", { queuedJobs: 1, liveGrants: 1 }],
  ["grant-live", { liveGrants: 1, lastActiveAt: now + 1 }],
  ["clock-unsure", { lastActiveAt: now + 1 }],
  ["recent", { lastActiveAt: now - minute }],
] as const;

for (const [reason, overrides] of keepCases) {
  test(`keeps a profile for ${reason} when that rule matches first`, () => {
    const profiles = [profile("a", overrides)];
    assert.deepEqual(pickIdleCloudProfiles({ now, profiles }), [{ id: "a", action: "keep", reason }]);
  });
}

test("keeps an open local profile idle for a day and a cloud profile waiting for three hours", () => {
  const profiles = [
    profile("local", { target: "local", lastActiveAt: now - 24 * 60 * minute }),
    profile("waiting", { waitingJobs: 1, lastActiveAt: now - 3 * 60 * minute }),
  ];
  assert.deepEqual(pickIdleCloudProfiles({ now, keepOpenAtMost: 0, profiles }), [
    { id: "local", action: "keep", reason: "not-cloud" },
    { id: "waiting", action: "keep", reason: "job-waiting" },
  ]);
});

test("keeps profiles with missing or invalid activity times even at a zero cap", () => {
  const { lastActiveAt, ...withoutTime } = profile("missing");
  const profiles = [
    withoutTime,
    { ...profile("text"), lastActiveAt: String(lastActiveAt) },
    profile("nan", { lastActiveAt: NaN }),
    profile("infinite", { lastActiveAt: -Infinity }),
  ];
  assert.deepEqual(pickIdleCloudProfiles({ now, keepOpenAtMost: 0, profiles }), profiles.map(({ id }) => ({
    id, action: "keep", reason: "clock-unsure",
  })));
});

test("uses a 15-minute idle limit and keeps at most two recent idle profiles by default", () => {
  const profiles = [
    profile("idle"),
    profile("at-limit", { lastActiveAt: now - 15 * minute }),
    profile("almost-idle", { lastActiveAt: now - 15 * minute + 1 }),
    profile("latest", { lastActiveAt: now }),
    profile("second-latest", { lastActiveAt: now - minute }),
  ];
  assert.deepEqual(pickIdleCloudProfiles({ now, profiles }), [
    { id: "idle", action: "close", reason: "idle" },
    { id: "at-limit", action: "close", reason: "idle" },
    { id: "almost-idle", action: "close", reason: "over-limit" },
    { id: "latest", action: "keep", reason: "recent" },
    { id: "second-latest", action: "keep", reason: "recent" },
  ]);
});

test("closes the two oldest recent idle profiles, breaks ties by id and preserves input order", () => {
  const profiles = Object.freeze([
    profile("z", { lastActiveAt: now - 18 * minute }),
    profile("newest", { lastActiveAt: now - minute }),
    profile("a", { lastActiveAt: now - 18 * minute }),
    profile("oldest", { lastActiveAt: now - 19 * minute }),
    profile("waiting", { lastActiveAt: now - 19 * minute, waitingJobs: 1 }),
    profile("granted", { lastActiveAt: now - 19 * minute, liveGrants: 1 }),
  ].map((entry) => Object.freeze(entry)));
  const input = Object.freeze({ now, idleLimitMs: 20 * minute, keepOpenAtMost: 2, profiles });
  assert.deepEqual(pickIdleCloudProfiles(input), [
    { id: "z", action: "keep", reason: "recent" },
    { id: "newest", action: "keep", reason: "recent" },
    { id: "a", action: "close", reason: "over-limit" },
    { id: "oldest", action: "close", reason: "over-limit" },
    { id: "waiting", action: "keep", reason: "job-waiting" },
    { id: "granted", action: "keep", reason: "grant-live" },
  ]);
});

test("ignores malformed input without throwing or recommending a close", () => {
  const { id, ...withoutId } = profile("missing-id");
  assert.deepEqual(pickIdleCloudProfiles({ now, profiles: [withoutId] }), []);
  for (const input of [
    null, "cloud", { now, profiles: {} }, { profiles: [profile(id)] },
    { now: Infinity, profiles: [profile(id)] },
    { now, idleLimitMs: -1, profiles: [profile(id)] },
    { now, keepOpenAtMost: 0.5, profiles: [profile(id)] },
    { now, get profiles() { throw new Error("unreadable profiles"); } },
  ]) {
    assert.deepEqual(pickIdleCloudProfiles(input), []);
  }
  assert.deepEqual(pickIdleCloudProfiles({ now, profiles: [
    null, withoutId, { ...profile("unknown-jobs"), waitingJobs: "1" }, profile("idle"),
  ] }), [{ id: "idle", action: "close", reason: "idle" }]);
});
