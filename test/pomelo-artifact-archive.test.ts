import assert from "node:assert/strict";
import { test } from "node:test";
import {
  archiveVersion,
  currentVersion,
  pickVersion,
  unarchiveVersion,
  visibleVersions,
  type ArtifactVersion,
} from "../src/pomelo/artifact-archive.js";

const versions = Object.freeze([3, 1, 2].map((version) => Object.freeze({
  id: "report",
  threadId: "thread-1",
  kind: "html" as const,
  version,
  bodyRef: `report-v${version}.html`,
  createdAt: version * 100,
})));
const [third, first, second] = versions;
const now = 400;

test("archiving marks only the requested version and preserves every record", () => {
  const input = versions.map((record) => ({ ...record }));
  const archived = archiveVersion(input, 2, now);

  assert.notEqual(archived, input);
  assert.deepEqual(archived, [third, first, { ...second, archivedAt: now }]);
  assert.deepEqual(input, versions);
  assert.deepEqual(archiveVersion(versions, 2, now), archived);
});

test("archiving twice keeps the first timestamp, including zero", () => {
  const archived = archiveVersion(versions, 2, 0);

  assert.deepEqual(archiveVersion(archived, 2, now), archived);
  assert.equal(archived[2].archivedAt, 0);
  assert.deepEqual(visibleVersions(archived), [first, third]);
});

test("visible versions hide archived records and sort by version number", () => {
  assert.deepEqual(visibleVersions(archiveVersion(versions, 2, now)), [first, third]);
  assert.deepEqual(visibleVersions(versions), [first, second, third]);
});

test("the current version is the highest visible version or null", () => {
  const withSecondArchived = archiveVersion(versions, 2, now);
  const onlyFirstVisible = archiveVersion(withSecondArchived, 3, now);
  const allArchived = archiveVersion(onlyFirstVisible, 1, now);

  assert.deepEqual(currentVersion(withSecondArchived), third);
  assert.deepEqual(currentVersion(onlyFirstVisible), first);
  assert.equal(currentVersion(allArchived), null);
  assert.equal(currentVersion([]), null);
  assert.equal(allArchived.length, versions.length);
});

test("the picker selects a visible request or explains its fallback", () => {
  const archived = archiveVersion(versions, 2, now);

  assert.deepEqual(pickVersion(archived, 1), { version: first });
  assert.deepEqual(pickVersion(archived, 2), { version: third, reason: "archived" });
  assert.deepEqual(pickVersion(archived, 9), { version: third, reason: "missing" });
  assert.deepEqual(pickVersion([{ ...second, archivedAt: now }], 2), { version: null, reason: "archived" });
  assert.deepEqual(pickVersion([], 9), { version: null, reason: "missing" });
});

test("unarchiving clears the marker and restores the version to the visible list", () => {
  const archivedThird = Object.freeze({ ...third, archivedAt: now });
  const archived = Object.freeze([archivedThird, first, second]);
  const restored = unarchiveVersion(archived, 3);

  assert.notEqual(restored, archived);
  assert.deepEqual(restored, versions);
  assert.deepEqual(visibleVersions(restored), [first, second, third]);
  assert.deepEqual(currentVersion(restored), third);
  assert.equal(archivedThird.archivedAt, now);
});

test("archive and unarchive leave records alone for invalid or missing version numbers", () => {
  for (const version of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid: ArtifactVersion = Object.freeze({ ...second, version });
    const archivedInvalid = Object.freeze({ ...invalid, archivedAt: now });

    assert.deepEqual(archiveVersion([invalid], version, now), [invalid]);
    assert.deepEqual(unarchiveVersion([archivedInvalid], version), [archivedInvalid]);
  }

  assert.deepEqual(archiveVersion(versions, 9, now), versions);
  assert.deepEqual(unarchiveVersion(versions, 9), versions);
});
