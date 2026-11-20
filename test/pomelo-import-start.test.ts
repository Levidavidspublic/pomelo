import assert from "node:assert/strict";
import test from "node:test";
import { importStartDecision, type ImportStartInput } from "../src/pomelo/import-start.js";

const input: ImportStartInput = {
  profile: { id: "profile-1", home: "pc", openHere: true },
  lockHolder: null,
  importRuns: [],
  pickedSites: ["example.test"],
  existingSites: ["other.test"],
  confirmReplace: false,
};

test("a free profile with no overlap can start an import", () => {
  const result = importStartDecision(input);
  assert.equal(result.verdict, "start");
  assert.deepEqual(result.overlapSites, []);
});

test("profile locks make the import wait and the reason names the holder kind", () => {
  for (const kind of ["job", "import"] as const) {
    const result = importStartDecision({ ...input, lockHolder: { kind, id: "holder-1" } });
    assert.equal(result.verdict, "wait");
    assert.match(result.reason, new RegExp(`\\b${kind}\\b`, "i"));
  }
});

test("an unfinished import targeting the same profile makes the import wait", () => {
  const result = importStartDecision({ ...input, importRuns: [{ targetProfileId: input.profile.id }] });
  assert.equal(result.verdict, "wait");
  assert.match(result.reason, /\bimport\b/i);
});

test("imports on other profiles and finished receipts do not block a start", () => {
  for (const importRuns of [
    [{ targetProfileId: "profile-2" }],
    [{ targetProfileId: input.profile.id, endedAt: 0 }],
  ]) {
    assert.equal(importStartDecision({ ...input, importRuns }).verdict, "start");
  }
});

test("a profile that cannot open here refuses an import", () => {
  const result = importStartDecision({ ...input, profile: { id: "profile-2", home: "vps", openHere: false } });
  assert.equal(result.verdict, "refuse");
});

test("an empty site selection refuses an import", () => {
  assert.equal(importStartDecision({ ...input, pickedSites: [] }).verdict, "refuse");
});

test("overlapping sites are listed in sorted order until replacement is confirmed", () => {
  const overlapping = {
    ...input,
    pickedSites: ["z.example.test", "other.test", "a.example.test", "A.EXAMPLE.TEST."],
    existingSites: ["z.example.test", "a.example.test"],
  };
  const overlapSites = ["a.example.test", "z.example.test"];
  const held = importStartDecision(overlapping);
  assert.equal(held.verdict, "hold");
  assert.deepEqual(held.overlapSites, overlapSites);

  const confirmed = importStartDecision({ ...overlapping, confirmReplace: true });
  assert.equal(confirmed.verdict, "start");
  assert.deepEqual(confirmed.overlapSites, overlapSites);
});

test("host comparisons ignore case and one trailing dot but keep subdomains distinct", () => {
  const result = importStartDecision({
    ...input,
    pickedSites: ["EXAMPLE.TEST", "mail.other.test", "third.test"],
    existingSites: ["example.test.", "other.test", "mail.third.test"],
  });
  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.overlapSites, ["example.test"]);
});

test("a running job makes an overlapping import wait before asking for confirmation", () => {
  const result = importStartDecision({
    ...input,
    lockHolder: { kind: "job", id: "job-1" },
    existingSites: input.pickedSites,
  });
  assert.equal(result.verdict, "wait");
  assert.match(result.reason, /\bjob\b/i);
});

test("an unexpected cookie field does not appear in the decision JSON", () => {
  const overlapping = { ...input, existingSites: input.pickedSites };
  const canary = "synthetic-cookie-canary";
  const withCookie = { ...overlapping, cookieValue: canary };
  const result = importStartDecision(withCookie);
  assert.deepEqual(result, importStartDecision(overlapping));
  assert.equal(JSON.stringify(result).includes(canary), false);
});
