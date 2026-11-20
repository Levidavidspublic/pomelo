import assert from "node:assert/strict";
import { test } from "node:test";
import { listThreadArtifacts } from "../src/pomelo/artifact-list.js";

const threadId = "thread-a";
const artifact = { id: "a", threadId, kind: "html", title: "Example", versions: [{ n: 1, createdAt: 100 }] };

test("lists the thread's artifacts newest first and breaks timestamp ties by id", () => {
  const records = [
    artifact,
    { ...artifact, id: "c", versions: [{ n: 1, createdAt: 200 }] },
    { ...artifact, id: "b", versions: [{ n: 1, createdAt: 200 }] },
    { ...artifact, id: "other", threadId: "thread-b", versions: [{ n: 1, createdAt: 300 }] },
    { ...artifact, threadId: "thread-b", versions: [] },
  ];

  assert.deepEqual(listThreadArtifacts(records, threadId), {
    rows: [
      { artifactId: "b", kind: "html", title: "Example", version: 1, versionCount: 1, updatedAt: 200 },
      { artifactId: "c", kind: "html", title: "Example", version: 1, versionCount: 1, updatedAt: 200 },
      { artifactId: "a", kind: "html", title: "Example", version: 1, versionCount: 1, updatedAt: 100 },
    ],
    hiddenCount: 0,
    more: false,
  });
});

test("uses the highest live version number and counts only live versions", () => {
  const records = [{
    ...artifact,
    versions: [
      { n: 3, createdAt: 300, archived: true },
      { n: 2, createdAt: 100, archived: false },
      { n: 1, createdAt: 200 },
    ],
  }];

  assert.deepEqual(listThreadArtifacts(records, threadId), {
    rows: [{ artifactId: "a", kind: "html", title: "Example", version: 2, versionCount: 2, updatedAt: 100 }],
    hiddenCount: 0,
    more: false,
  });
});

test("counts empty histories and all-archived artifacts as hidden", () => {
  const records = [
    { ...artifact, versions: [{ n: 1, createdAt: 100, archived: true }] },
    { ...artifact, id: "b", versions: [] },
  ];

  assert.deepEqual(listThreadArtifacts(records, threadId), { rows: [], hiddenCount: 2, more: false });
});

test("duplicates keep the higher live version, with timestamp deciding equal versions", () => {
  const records = [
    { ...artifact, title: "Higher version", versions: [{ n: 2, createdAt: 90 }] },
    { ...artifact, title: "Lower live version", versions: [...artifact.versions, { n: 3, createdAt: 300, archived: true }] },
    { ...artifact, title: "Later copy", versions: [...artifact.versions, { n: 2, createdAt: 95 }] },
  ];
  const expected = {
    rows: [{ artifactId: "a", kind: "html", title: "Later copy", version: 2, versionCount: 2, updatedAt: 95 }],
    hiddenCount: 0,
    more: false,
  };

  assert.deepEqual(listThreadArtifacts(records, threadId, { limit: 1 }), expected);
  assert.deepEqual(listThreadArtifacts([...records].reverse(), threadId, { limit: 1 }), expected);
});

test("counts records with a missing id, unknown kind, or non-finite time as hidden", () => {
  const records = [
    { threadId, kind: "html", title: "No id", versions: artifact.versions },
    { ...artifact, id: "b", kind: "widget" },
    { ...artifact, id: "c", kind: "constructor" },
    { ...artifact, id: "d", versions: [{ n: 1, createdAt: NaN }] },
    { ...artifact, id: "e", versions: [...artifact.versions, { n: 2, createdAt: Infinity, archived: true }] },
    artifact,
  ];

  assert.deepEqual(listThreadArtifacts(records, threadId), {
    rows: [{ artifactId: "a", kind: "html", title: "Example", version: 1, versionCount: 1, updatedAt: 100 }],
    hiddenCount: 5,
    more: false,
  });
});

test("uses plain fallbacks for empty titles and keeps Hebrew titles as provided", () => {
  const hebrewTitle = "דּוּחַ שְׁנָתִי";
  const records = [
    { ...artifact, title: "" },
    { ...artifact, id: "b", kind: "mermaid", title: "" },
    { ...artifact, id: "c", kind: "chart", title: "" },
    { ...artifact, id: "d", kind: "image", title: "" },
    { ...artifact, id: "e", title: hebrewTitle },
  ];

  const { rows } = listThreadArtifacts(records, threadId);
  assert.deepEqual(rows.map(({ title }) => title), ["HTML page", "Diagram", "Chart", "Image", hebrewTitle]);
});

test("defaults to 50 rows, clamps the limit, and marks omitted rows", () => {
  const records = Array.from({ length: 201 }, (_, index) => ({
    ...artifact,
    id: `artifact-${index}`,
    versions: [{ n: 1, createdAt: index }],
  }));

  assert.equal(listThreadArtifacts(records, threadId).rows.length, 50);
  for (const [limit, rowCount] of [[1, 1], [0, 1], [500, 200]]) {
    const { rows, hiddenCount, more } = listThreadArtifacts(records, threadId, { limit });
    assert.equal(rows.length, rowCount);
    assert.equal(rows[0]?.artifactId, "artifact-200");
    assert.equal(hiddenCount, 0);
    assert.equal(more, true);
  }
});

test("leaves the input array and records deeply unchanged", () => {
  const records = [
    artifact,
    { ...artifact, id: "b", versions: [{ n: 1, createdAt: 300 }, { n: 2, createdAt: 200 }] },
  ];
  const before = structuredClone(records);

  listThreadArtifacts(records, threadId, { limit: 1 });

  assert.deepEqual(records, before);
});
