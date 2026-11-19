import assert from "node:assert/strict";
import { test } from "node:test";
import type { PanelProfile } from "../src/client/pomelo/browser-panel.js";
import { importWizard } from "../src/client/pomelo/import-wizard.js";
import type { ImportRun } from "../src/pomelo/import-run.js";

const profiles = [
  { id: "local", name: "Local browser", location: "local" },
  { id: "cloud", name: "Cloud browser", location: "cloud" },
] satisfies PanelProfile[];
const ready = {
  extensionPaired: true,
  sourceProfile: "Profile 1",
  sites: ["one.example.test", "two.example.test"],
  targetProfileId: "local",
  profiles,
};
const started = {
  sourceProfile: ready.sourceProfile,
  targetProfileId: ready.targetProfileId,
  startedAt: 1_000,
  sites: [],
} satisfies ImportRun;

test("blocks at the first missing prerequisite and explains how to proceed", () => {
  const cases = [
    [{ extensionPaired: false, sourceProfile: "", sites: [], targetProfileId: "" }, "extension", "Pair the Chrome companion extension."],
    [{ sourceProfile: "  ", sites: [], targetProfileId: "" }, "source", "Choose a Chrome profile."],
    [{ sites: [], targetProfileId: "" }, "source", "Choose at least one site to import."],
    [{ targetProfileId: "" }, "target", "Choose a Pomelo profile."],
    [{ targetProfileId: "missing" }, "target", "Choose a Pomelo profile."],
  ] as const;
  for (const [overrides, step, reason] of cases) {
    const model = importWizard({ ...ready, ...overrides });
    assert.equal(model.step, step);
    assert.equal(model.canNext, false);
    assert.equal(model.blockedReason, reason);
    assert.deepEqual(model.rows, []);
  }
});

test("enables the import once the three setup steps are complete", () => {
  const model = importWizard(ready);
  assert.equal(model.step, "running");
  assert.equal(model.canNext, true);
  assert.equal(model.nextLabel, "Run import");
  assert.equal(model.blockedReason, null);
  assert.deepEqual(model.steps.map(({ id, state }) => [id, state]), [
    ["extension", "complete"],
    ["source", "complete"],
    ["target", "complete"],
    ["running", "current"],
    ["results", "upcoming"],
  ]);
});

test("an active import disables the next action and waits to show results", () => {
  const run: ImportRun = { ...started, sites: [{ site: ready.sites[0], result: "imported" }] };
  for (const receipt of [run, { ...run, endedAt: null }]) {
    const model = importWizard({ ...ready, run: receipt });
    assert.equal(model.step, "running");
    assert.equal(model.canNext, false);
    assert.equal(model.nextLabel, null);
    assert.equal(model.headline, "Importing sites…");
    assert.deepEqual(model.rows, []);
  }
});

test("reports all sites imported only after every result is imported", () => {
  const run: ImportRun = {
    ...started,
    sites: ready.sites.map((site) => ({ site, result: "imported" })),
    endedAt: 2_000,
  };
  const model = importWizard({ ...ready, run });
  assert.equal(model.step, "results");
  assert.equal(model.canNext, false);
  assert.equal(model.nextLabel, null);
  assert.equal(model.headline, "All 2 sites imported");
  assert.deepEqual(model.steps.slice(-2).map(({ id, state }) => [id, state]), [
    ["running", "complete"],
    ["results", "current"],
  ]);
  assert.deepEqual(model.rows, ready.sites.map((site) => ({
    site, result: "imported", label: "Imported", tone: "good",
  })));
});

test("a partial import counts each outcome and shows problems first", () => {
  const model = importWizard({
    ...ready,
    sites: ["one.example.test", "two.example.test", "three.example.test", "four.example.test", "five.example.test"],
    run: {
      ...started,
      sites: Object.freeze([
        { site: "one.example.test", result: "imported" },
        { site: "two.example.test", result: "expired" },
        { site: "three.example.test", result: "imported" },
        { site: "four.example.test", result: "incompatible" },
        { site: "five.example.test", result: "incompatible" },
      ]),
      endedAt: 2_000,
    },
  });
  assert.equal(model.step, "results");
  assert.equal(model.headline, "2 of 5 imported · 1 expired · 2 incompatible");
  assert.doesNotMatch(model.headline, /done/i);
  assert.deepEqual(model.rows, [
    { site: "two.example.test", result: "expired", label: "Expired (sign in again in Chrome)", tone: "warn" },
    { site: "four.example.test", result: "incompatible", label: "Incompatible (device-bound)", tone: "bad" },
    { site: "five.example.test", result: "incompatible", label: "Incompatible (device-bound)", tone: "bad" },
    { site: "one.example.test", result: "imported", label: "Imported", tone: "good" },
    { site: "three.example.test", result: "imported", label: "Imported", tone: "good" },
  ]);
});

test("counts unfamiliar results as skipped and gives them a warning label", () => {
  const model = importWizard({
    ...ready,
    run: {
      ...started,
      sites: [
        { site: ready.sites[0], result: "toString" },
        { site: ready.sites[1], result: "skipped" },
      ],
      endedAt: 2_000,
    },
  });
  assert.equal(model.headline, "0 of 2 imported · 2 skipped");
  assert.deepEqual(model.rows, ready.sites.map((site) => ({
    site, result: "skipped", label: "Skipped", tone: "warn",
  })));
});

test("a finished receipt counts missing picked sites as skipped", () => {
  const sites = [...ready.sites, "three.example.test", "four.example.test", "five.example.test"];
  const run: ImportRun = {
    ...started,
    sites: ready.sites.map((site) => ({ site, result: "imported" })),
    endedAt: 2_000,
  };
  const model = importWizard({ ...ready, sites, run });
  assert.equal(model.step, "results");
  assert.equal(model.headline, "2 of 5 imported · 3 skipped");
  assert.deepEqual(model.rows, [
    ...sites.slice(2).map((site) => ({ site, result: "skipped", label: "Skipped", tone: "warn" })),
    ...ready.sites.map((site) => ({ site, result: "imported", label: "Imported", tone: "good" })),
  ]);
});

test("matches normalized receipt hostnames and excludes results for unpicked sites", () => {
  const sites = ["ONE.EXAMPLE.TEST.", ready.sites[1]];
  const run: ImportRun = {
    ...started,
    sites: [
      { site: ready.sites[0], result: "imported" },
      { site: "unpicked.example.test", result: "imported" },
    ],
    endedAt: 2_000,
  };
  const model = importWizard({ ...ready, sites, run });
  assert.equal(model.headline, "1 of 2 imported · 1 skipped");
  assert.deepEqual(model.rows.map(({ site, result }) => [site, result]), [
    [sites[1], "skipped"],
    [sites[0], "imported"],
  ]);
});

test("an empty finished receipt counts every picked site as skipped", () => {
  const run: ImportRun = { ...started, startedAt: 0, endedAt: 0 };
  const model = importWizard({ ...ready, run });
  assert.equal(model.step, "results");
  assert.equal(model.headline, "0 of 2 imported · 2 skipped");
  assert.deepEqual(model.rows, ready.sites.map((site) => ({
    site, result: "skipped", label: "Skipped", tone: "warn",
  })));
});

test("a finished import without any picked sites shows an empty state", () => {
  const model = importWizard({ ...ready, sites: [], run: { ...started, endedAt: 2_000 } });
  assert.equal(model.step, "results");
  assert.equal(model.headline, "No site results available");
  assert.deepEqual(model.rows, []);
});

test("a cloud target sets the VPS badge for the selection and the active run", () => {
  assert.equal(Object.hasOwn(importWizard(ready), "vps"), false);
  assert.equal(importWizard({ ...ready, targetProfileId: "cloud" }).vps, true);
  assert.equal(importWizard({ ...ready, run: { ...started, targetProfileId: "cloud" } }).vps, true);
});

test("the serialized model contains only site and result data from each receipt row", () => {
  const canary = "made-up-import-canary";
  const sites = ready.sites.map((site) => ({
    site,
    result: "imported" as const,
    name: canary,
    value: canary,
    cookies: [{ value: canary }],
  }));
  const model = importWizard({ ...ready, run: { ...started, sites, endedAt: 2_000 } });
  assert.equal(JSON.stringify(model).includes(canary), false);
  assert.deepEqual(model.rows, ready.sites.map((site) => ({
    site, result: "imported", label: "Imported", tone: "good",
  })));
});
