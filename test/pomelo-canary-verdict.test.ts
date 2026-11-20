import assert from "node:assert/strict";
import test from "node:test";
import {
  CANARY_SURFACES,
  canaryVerdict,
  type CanaryScanResult,
  type CanarySurface,
} from "../src/pomelo/canary-verdict.js";

function scanned(surface: CanarySurface, fields: Partial<Omit<CanaryScanResult, "surface">> = {}): CanaryScanResult {
  return { surface, ran: true, itemsScanned: 2, hitCount: 0, hitPlaces: [], ...fields };
}

const surfaces = ["model-input", "logs", "bus", "storage"] as const;
const complete = () => surfaces.map((surface) => scanned(surface));
const logPlace = { file: "logs/run.jsonl", line: 7 };
const busPlace = { eventId: "event-2", field: "event.text" };

test("returns clean only after all four nonempty scans found zero hits", () => {
  assert.deepEqual(CANARY_SURFACES, surfaces);
  assert.ok(Object.isFrozen(CANARY_SURFACES));
  const result = canaryVerdict(Object.freeze(complete().reverse().map((scan) => Object.freeze(scan))));
  assert.equal(result.verdict, "clean");
  assert.deepEqual(result.hitsBySurface, {});
  assert.deepEqual(result.issues, []);
  assert.match(result.summary, /^clean\b.*zero hits/);
});

test("reports the file and line of a hit under logs", () => {
  const result = canaryVerdict([
    scanned("model-input"),
    scanned("logs", { hitCount: 1, hitPlaces: [logPlace] }),
    scanned("bus"),
    scanned("storage"),
  ]);
  assert.equal(result.verdict, "leak");
  assert.deepEqual(result.hitsBySurface, { logs: [logPlace] });
  assert.match(result.summary, /^leak\b/);
});

test("keeps every hit place across surfaces", () => {
  const secondLogPlace = { file: "logs/run.jsonl", line: 14 };
  const result = canaryVerdict([
    scanned("model-input"),
    scanned("logs", { hitCount: 2, hitPlaces: [logPlace, secondLogPlace] }),
    scanned("bus", { hitCount: 1, hitPlaces: [busPlace] }),
    scanned("storage"),
  ]);
  assert.equal(result.verdict, "leak");
  assert.deepEqual(result.hitsBySurface, { logs: [logPlace, secondLogPlace], bus: [busPlace] });
});

test("names a missing, unrun, or empty surface", () => {
  const cases = [
    { scans: complete().filter(({ surface }) => surface !== "bus"), issue: "bus missing" },
    { scans: [...complete().slice(0, 3), scanned("storage", { ran: false })], issue: "storage did not run" },
    { scans: [scanned("model-input", { itemsScanned: 0 }), ...complete().slice(1)], issue: "model-input scanned zero items" },
  ];
  for (const { scans, issue } of cases) {
    const result = canaryVerdict(scans);
    assert.equal(result.verdict, "not-proven");
    assert.deepEqual(result.issues, [issue]);
    assert.ok(result.summary.startsWith("not-proven "));
    assert.ok(result.summary.includes(issue));
  }
});

test("reports a leak and still names missing coverage", () => {
  const result = canaryVerdict([
    scanned("model-input"),
    scanned("logs", { hitCount: 1, hitPlaces: [logPlace] }),
    scanned("storage"),
  ]);
  assert.equal(result.verdict, "leak");
  assert.deepEqual(result.hitsBySurface, { logs: [logPlace] });
  assert.deepEqual(result.issues, ["bus missing"]);
  assert.match(result.summary, /^leak\b.*bus missing/);
});

test("duplicates and unknown surfaces each prevent a clean verdict", () => {
  const duplicate = canaryVerdict([...complete(), scanned("bus")]);
  assert.equal(duplicate.verdict, "not-proven");
  assert.deepEqual(duplicate.issues, ["bus listed twice"]);

  const unknownName = "other-surface";
  const unknown = canaryVerdict([...complete(), { ...scanned("bus"), surface: unknownName }]);
  assert.equal(unknown.verdict, "not-proven");
  assert.deepEqual(unknown.issues, ["unknown surface"]);
  assert.ok(!JSON.stringify(unknown).includes(unknownName));
});

test("keeps hits in duplicate records and in records with an unknown surface", () => {
  const result = canaryVerdict([
    ...complete(),
    scanned("logs", { hitCount: 1, hitPlaces: [logPlace] }),
    scanned("logs", { hitCount: 1, hitPlaces: [{ ...logPlace, line: 8 }] }),
    { ...scanned("bus", { hitCount: 1, hitPlaces: [busPlace] }), surface: "other-surface" },
  ]);
  assert.equal(result.verdict, "leak");
  assert.deepEqual(result.hitsBySurface, { logs: [logPlace, { ...logPlace, line: 8 }], unknown: [busPlace] });
  assert.deepEqual(result.issues, ["logs listed twice", "unknown surface"]);
});

test("replaces oversized locations and copies only location metadata", () => {
  const longFile = "x".repeat(201);
  const longEventId = "e".repeat(198);
  const fileAtLimit = "f".repeat(200);
  const extraProperty = "extra fixture text";
  const result = canaryVerdict([
    scanned("model-input"),
    scanned("logs", { hitCount: 2, hitPlaces: [
      { file: longFile, line: 8 },
      Object.freeze({ file: fileAtLimit, line: 9, extra: extraProperty }),
    ] }),
    scanned("bus", { hitCount: 1, hitPlaces: [{ eventId: longEventId, field: "text" }] }),
    scanned("storage"),
  ]);
  assert.equal(result.verdict, "leak");
  assert.deepEqual(result.hitsBySurface, {
    logs: ["[location omitted]", { file: fileAtLimit, line: 9 }],
    bus: ["[location omitted]"],
  });
  const output = JSON.stringify(result);
  for (const text of [longFile, longEventId, extraProperty]) assert.ok(!output.includes(text));
  assert.ok(!/[\r\n]/.test(result.summary));
});

test("rejects invalid scan evidence and keeps reported hits with incomplete details", () => {
  for (const fields of [{ ran: "true" }, { itemsScanned: NaN }, { hitCount: -1 }, { hitPlaces: undefined }]) {
    const result = canaryVerdict([...complete().slice(0, 3), { ...scanned("storage"), ...fields }]);
    assert.equal(result.verdict, "not-proven");
    assert.match(result.summary, /storage/);
  }
  const result = canaryVerdict([
    ...complete().slice(0, 3),
    scanned("storage", { ran: false, hitCount: 1 }),
  ]);
  assert.equal(result.verdict, "leak");
  assert.deepEqual(result.hitsBySurface, { storage: [] });

  const uncountedHit = canaryVerdict([
    ...complete().slice(0, 3),
    scanned("storage", { hitPlaces: [logPlace] }),
  ]);
  assert.equal(uncountedHit.verdict, "leak");
  assert.deepEqual(uncountedHit.hitsBySurface, { storage: [logPlace] });
});

test("returns not-proven for non-array input", () => {
  for (const input of [null, undefined, {}, "invalid", 42]) {
    const result = canaryVerdict(input);
    assert.equal(result.verdict, "not-proven");
    assert.ok(result.summary.startsWith("not-proven "));
  }
});
