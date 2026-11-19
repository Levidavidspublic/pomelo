import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IMPORT_SITE_RESULTS,
  addSiteResult,
  finishImportRun,
  importRunKey,
  startImportRun,
  summariseImportRun,
  type ImportResult,
} from "../src/pomelo/import-run.js";

const profile = {
  sourceProfile: "Profile 1",
  targetProfileId: "profile-1",
  startedAt: 1_000,
};

test("namespaces the import run key", () => {
  assert.equal(importRunKey("run-1"), "pomelo:import:run-1");
});

test("starts a run with an empty site list and no end time", () => {
  const run = startImportRun(profile);
  assert.deepEqual(run, { ...profile, sites: [] });
  assert.equal(Object.hasOwn(run, "endedAt"), false);
});

test("adds site results without changing the input run", () => {
  const run = startImportRun(profile);
  const updated = addSiteResult(run, "accounts.example.test", "imported");
  assert.notEqual(updated, run);
  assert.deepEqual(run.sites, []);
  assert.deepEqual(updated, {
    ...profile,
    sites: [{ site: "accounts.example.test", result: "imported" }],
  });
});

test("replaces an earlier result for the same host", () => {
  const run = addSiteResult(startImportRun(profile), "a.example.test", "expired");
  const withTwoSites = addSiteResult(run, "b.example.test", "skipped");
  const retried = addSiteResult(withTwoSites, "A.EXAMPLE.TEST.", "imported");
  assert.deepEqual(retried.sites, [
    { site: "a.example.test", result: "imported" },
    { site: "b.example.test", result: "skipped" },
  ]);
  assert.equal(withTwoSites.sites[0]?.result, "expired");
});

test("rejects an unknown result on input or in an existing receipt", () => {
  const run = startImportRun(profile);
  const result = "pending" as ImportResult;
  assert.throws(() => addSiteResult(run, "example.test", result), /result/i);
  assert.throws(() => summariseImportRun({
    ...run,
    sites: [{ site: "example.test", result }],
  }), /result/i);
});

test("requires a hostname in a site result", () => {
  const run = startImportRun(profile);
  for (const site of [
    "example.test/path",
    "example.test?query",
    "https://example.test",
    "example.test=fixture",
    "example.test#fragment",
    "example.test:443",
    "name@example.test",
    "example.test\n",
    "example..test",
    "-example.test",
    "",
  ]) {
    assert.throws(() => addSiteResult(run, site, "imported"), /host/i);
  }
  assert.throws(() => addSiteResult(run, { site: "example.test", value: "fixture" } as unknown as string, "imported"), /host/i);
});

test("rejects extra fields on start inputs, runs, and recorded sites", () => {
  const run = startImportRun(profile);
  for (const field of ["value", "cookie", "cookies", "token", "extra"]) {
    const extra = { [field]: "fixture" };
    const start = { ...profile, ...extra };
    const invalidRun = { ...run, ...extra };
    const invalidSite = { site: "example.test", result: "imported" as const, ...extra };
    const runWithInvalidSite = { ...run, sites: [invalidSite] };

    assert.throws(() => startImportRun(start), /fields/i);
    for (const invalid of [invalidRun, runWithInvalidSite]) {
      assert.throws(() => addSiteResult(invalid, "next.example.test", "skipped"), /fields/i);
      assert.throws(() => finishImportRun(invalid, 2_000), /fields/i);
      assert.throws(() => summariseImportRun(invalid), /fields/i);
    }
  }
});

test("rejects hidden fields and serialization hooks", () => {
  const run = addSiteResult(startImportRun(profile), "example.test", "imported");
  const hidden = Object.defineProperty({ ...run }, "value", { value: "fixture" });
  assert.throws(() => finishImportRun(hidden, 2_000), /fields/i);

  const sites = Object.assign([...run.sites], { toJSON: () => ({ value: "fixture" }) });
  assert.throws(() => finishImportRun({ ...run, sites }, 2_000), /sites/i);
});

test("serializes a finished receipt using only schema fields", () => {
  const run = addSiteResult(startImportRun(profile), "example.test", "incompatible");
  const finished = finishImportRun(run, 2_000);
  assert.deepEqual(JSON.parse(JSON.stringify(finished)), {
    ...profile,
    sites: [{ site: "example.test", result: "incompatible" }],
    endedAt: 2_000,
  });
});

test("finishes a run at or after its start and then refuses site changes", () => {
  const run = startImportRun(profile);
  assert.throws(() => finishImportRun(run, 999), /before/i);
  assert.throws(() => finishImportRun(run, Infinity), /endedAt/i);
  assert.equal(finishImportRun(run, 1_000).endedAt, 1_000);
  const finished = finishImportRun(run, 2_000);
  assert.equal(finished.endedAt, 2_000);
  assert.equal(run.endedAt, undefined);
  assert.throws(() => addSiteResult(finished, "example.test", "imported"), /finished/i);
  assert.throws(() => finishImportRun(finished, 3_000), /finished/i);
});

test("summarises every result with a total equal to the site count", () => {
  let run = startImportRun(profile);
  assert.deepEqual(summariseImportRun(run), {
    imported: 0, expired: 0, incompatible: 0, skipped: 0, total: 0,
  });

  assert.deepEqual(IMPORT_SITE_RESULTS, ["imported", "expired", "incompatible", "skipped"]);
  for (const result of IMPORT_SITE_RESULTS) {
    run = addSiteResult(run, `${result}.example.test`, result);
  }
  run = addSiteResult(run, "another.example.test", "imported");
  run = addSiteResult(run, "expired.example.test", "imported");
  const finished = finishImportRun(run, 2_000);
  assert.deepEqual(summariseImportRun(finished), {
    imported: 3, expired: 0, incompatible: 1, skipped: 1, total: finished.sites.length,
  });
});
