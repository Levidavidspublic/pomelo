import assert from "node:assert/strict";
import test from "node:test";
import { cloudSettings } from "../src/client/pomelo/cloud-settings.js";

const now = 1_000_000;
const profile = { id: "example-cloud", name: "Cloud browser", location: "cloud", cdpUrlName: "POMELO_CDP_URL_2" };
const reachable = { state: "reachable", lastOkAt: now - 10_000, heldReason: null, retryAfterMs: null };
const canary = "FIXTURE-canary_0A123";
const input = { profiles: [profile], reachByProfileId: { [profile.id]: reachable }, now };

test("no cloud profile gives one setup section with a next step", () => {
  for (const profiles of [[], [null, {}, { ...profile, location: "local" }]]) {
    assert.deepEqual(cloudSettings({ ...input, profiles }), {
      title: "Cloud browser",
      status: "not-set-up",
      nextStep: "Add a cloud browser profile with a Pomelo environment variable name.",
      rows: [],
    });
  }
});

test("a reachable cloud profile shows its name, environment name, VPS badge and last seen time", () => {
  assert.deepEqual(cloudSettings(input), {
    title: "Cloud browser",
    status: "set-up",
    nextStep: null,
    rows: [{
      name: profile.name,
      cdpUrlName: profile.cdpUrlName,
      badge: "VPS",
      status: "reachable",
      label: "Reachable",
      lastSeen: "Last seen 10 seconds ago",
      action: "none",
    }],
  });
});

test("slow and unreachable have distinct labels and only unreachable offers retry", () => {
  for (const [state, label, action] of [
    ["slow", "Slow", "none"],
    ["unreachable", "VPS not reachable", "retry"],
  ]) {
    const reachByProfileId = { [profile.id]: { ...reachable, state, lastOkAt: now - 120_000 } };
    const [row] = cloudSettings({ ...input, reachByProfileId }).rows;

    assert.equal(row?.status, state);
    assert.equal(row?.label, label);
    assert.equal(row?.action, action);
    assert.equal(row?.lastSeen, "Last seen 2 minutes ago");
  }
});

test("last seen uses the supplied time and ignores invalid or future times", () => {
  assert.equal(cloudSettings({ ...input, now: reachable.lastOkAt }).rows[0]?.lastSeen, "Last seen just now");
  assert.equal(cloudSettings({ ...input, now: reachable.lastOkAt + 3_600_000 }).rows[0]?.lastSeen, "Last seen 1 hour ago");
  for (const lastOkAt of [null, NaN, Infinity, now + 1, String(now)]) {
    const reachByProfileId = { [profile.id]: { ...reachable, state: "unreachable", lastOkAt } };
    assert.equal(cloudSettings({ ...input, reachByProfileId }).rows[0]?.lastSeen, "Never seen");
  }
  const [row] = cloudSettings({ ...input, reachByProfileId: {} }).rows;
  assert.equal(row?.status, "unreachable");
  assert.equal(row?.lastSeen, "Never seen");
  assert.equal(row?.action, "retry");
});

test("address and credential text is dropped and the affected row needs fixing", () => {
  const unsafeStrings = [
    "ws://browser.invalid/devtools",
    "http://browser.invalid/",
    "browser.invalid",
    "192.0.2.41",
    "2001:db8::41",
    ":49123",
    "49123",
    "port 49123",
    "FixtureCredential0A123",
    `?token=${canary}`,
    `Bearer ${canary}`,
  ];
  for (const unsafe of unsafeStrings) {
    const cases = [
      { ...input, profiles: [{ ...profile, name: unsafe }] },
      { ...input, profiles: [{ ...profile, cdpUrlName: unsafe }] },
      { ...input, profiles: [{ ...profile, diagnostic: unsafe }] },
      { ...input, reachByProfileId: { [profile.id]: { ...reachable, diagnostic: unsafe } } },
    ];
    for (const args of cases) {
      const result = cloudSettings(args);
      assert.equal(result.rows[0]?.status, "needs-fixing");
      assert.equal(result.rows[0]?.action, "none");
      assert.equal(JSON.stringify(result).includes(unsafe), false);
      assert.equal(JSON.stringify(result).includes(canary), false);
    }
  }
  const result = cloudSettings({ ...input, profiles: [{ ...profile, port: 49123 }] });
  assert.equal(result.rows[0]?.status, "needs-fixing");
  assert.equal(JSON.stringify(result).includes("49123"), false);
});

test("the environment name must match the Pomelo resolver's environment name rule", () => {
  for (const cdpUrlName of [undefined, null, 42, "", "POMELO_", "CDP_URL", "POMELO_cdp", "POMELO_CDP-URL", "POMELO_CDP_URL\n"]) {
    const [row] = cloudSettings({ ...input, profiles: [{ ...profile, cdpUrlName }] }).rows;

    assert.equal(row?.status, "needs-fixing");
    assert.equal(row?.label, "Needs fixing");
    assert.equal(row?.cdpUrlName, null);
  }
});

test("only approved metadata makes it into the result", () => {
  for (const field of ["id", "name", "location", "cdpUrlName", "importedFrom", "note"]) {
    const profiles = [{ ...profile, [field]: canary }];
    assert.equal(JSON.stringify(cloudSettings({ ...input, profiles })).includes(canary), false);
  }
  for (const field of ["state", "lastOkAt", "heldReason", "retryAfterMs", "note"]) {
    const reachByProfileId = { [profile.id]: { ...reachable, [field]: canary } };
    assert.equal(JSON.stringify(cloudSettings({ ...input, reachByProfileId })).includes(canary), false);
  }
  const profiles = [{ ...profile, id: canary }];
  const reachByProfileId = { [canary]: { ...reachable, details: { token: canary } } };
  const result = cloudSettings({ ...input, profiles, reachByProfileId });
  assert.equal(result.rows[0]?.status, "needs-fixing");
  assert.equal(JSON.stringify(result).includes(canary), false);
});

test("cloud profiles sort by name and keep Hebrew names whole", () => {
  const hebrew = "דַּפְדְּפָן עָנָן";
  const profiles = Object.freeze([
    { ...profile, id: "hebrew", name: hebrew, importedFrom: "Chrome", encryptedAtRest: true },
    { ...profile, id: "zulu", name: "Zulu" },
    { ...profile, id: "local", name: "This computer", location: "local" },
    { ...profile, id: "alpha", name: "Alpha" },
  ]);
  const names = (records: typeof profiles) => cloudSettings({ ...input, profiles: records }).rows.map(({ name }) => name);

  assert.deepEqual(names(profiles), ["Alpha", "Zulu", hebrew]);
  assert.deepEqual(names(profiles.toReversed()), names(profiles));
});
