import assert from "node:assert/strict";
import test from "node:test";
import { railGroups } from "../src/client/pomelo/rail-order.js";
import type { RecentSession } from "../src/client/storage.js";

const r = (sid: string, openedAt: number, pinnedAt?: number): RecentSession => ({ sid, title: sid, invite: "i", role: "owner", openedAt, pinnedAt });

test("threads sort by activity within their pin status and fall back to when they were opened", () => {
  const rows = [r("opened-later", 40), r("pinned-first", 10, 1), r("active", 20), r("pinned-later", 50, 2)];
  const groups = railGroups(rows, {
    active: { lastActivityAt: 60 },
    "pinned-first": { lastActivityAt: 30 },
  });

  assert.deepEqual(groups[0].rows.map(({ sid, lastActivityAt }) => [sid, lastActivityAt]), [
    ["pinned-later", 50], ["pinned-first", 30], ["active", 60], ["opened-later", 40],
  ]);
});

test("threads appear under each tag, and groups follow their newest thread with Untagged last", () => {
  const rows = [r("unfiled", 100), r("review", 20), r("pinned", 10, 1), r("docs", 45), r("shared", 30)];
  const groups = railGroups(rows, {
    docs: { projectTags: ["docs"], lastActivityAt: 90 },
    pinned: { projectTags: ["build"] },
    shared: { projectTags: ["docs", "build"], lastActivityAt: 80, runningSubagents: 2 },
    unfiled: { projectTags: [] },
    review: { projectTags: ["review"], lastActivityAt: 70 },
  }, { docs: "Documentation", build: "Build" });

  assert.deepEqual(groups.map(({ tag, label, rows }) => [tag, label, rows.map(({ sid, runningSubagents }) => [sid, runningSubagents])]), [
    ["docs", "Documentation", [["docs", 0], ["shared", 2]]],
    ["build", "Build", [["pinned", 0], ["shared", 2]]],
    ["review", "review", [["review", 0]]],
    [null, "Untagged", [["unfiled", 0]]],
  ]);
});

test("grouping leaves the input rows and metadata unchanged", () => {
  const rows = Object.freeze([Object.freeze(r("older", 10)), Object.freeze(r("newer", 20))]);
  const meta = Object.freeze({ older: Object.freeze({ projectTags: Object.freeze(["docs", "build"]) }) });
  const labels = Object.freeze({ docs: "Documentation" });

  railGroups(rows, meta, labels);

  assert.deepEqual(rows, [r("older", 10), r("newer", 20)]);
  assert.deepEqual(meta, { older: { projectTags: ["docs", "build"] } });
  assert.deepEqual(labels, { docs: "Documentation" });
  assert.deepEqual(railGroups([], {}), []);
});
