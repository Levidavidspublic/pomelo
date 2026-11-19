import assert from "node:assert/strict";
import test from "node:test";
import { profileSwitch } from "../src/client/pomelo/profile-switch.js";

const local = { id: "local", name: "Local browser", location: "local" } as const;
const cloud = { id: "cloud", name: "Cloud browser", location: "cloud" } as const;
const input = {
  profiles: [local, cloud],
  jobs: [],
  currentProfileId: local.id,
  cloudReachable: true,
} as const;

test("the current profile comes first, then local before cloud, each by name", () => {
  const profiles = Object.freeze([
    { ...cloud, id: "cloud-z", name: "Zulu" },
    local,
    { ...local, id: "local-a", name: "Alpha" },
    { ...cloud, id: "cloud-a", name: "Aardvark" },
    cloud,
  ]);

  assert.deepEqual(profileSwitch({ ...input, profiles, currentProfileId: cloud.id }), {
    options: [
      { id: "cloud", label: "Cloud browser", current: true, vps: true, disabled: false, reason: null },
      { id: "local-a", label: "Alpha", current: false, vps: false, disabled: false, reason: null },
      { id: "local", label: "Local browser", current: false, vps: false, disabled: false, reason: null },
      { id: "cloud-a", label: "Aardvark", current: false, vps: true, disabled: false, reason: null },
      { id: "cloud-z", label: "Zulu", current: false, vps: true, disabled: false, reason: null },
    ],
    canSwitch: true,
    emptyLine: null,
  });
});

test("running and waiting jobs each prevent picking the profile they hold", () => {
  for (const state of ["running", "waiting"]) {
    const result = profileSwitch({ ...input, jobs: [{ profileId: cloud.id, state }] });

    assert.deepEqual(result.options[1], {
      id: cloud.id,
      label: cloud.name,
      current: false,
      vps: true,
      disabled: true,
      reason: "A job is running on this profile",
    });
    assert.equal(result.options[0]?.disabled, false);
    assert.equal(result.canSwitch, false);
  }
});

test("queued and finished jobs leave a profile available", () => {
  const jobs = ["queued", "done", "failed", "cancelled"].map((state) => ({ profileId: cloud.id, state }));
  const result = profileSwitch({ ...input, jobs });

  assert.equal(result.options[1]?.disabled, false);
  assert.equal(result.options[1]?.reason, null);
  assert.equal(result.canSwitch, true);
});

test("an unreachable VPS disables cloud profiles with a reason and leaves local profiles available", () => {
  const result = profileSwitch({ ...input, currentProfileId: null, cloudReachable: false });

  assert.equal(result.options[0]?.disabled, false);
  assert.equal(result.options[1]?.disabled, true);
  assert.equal(result.options[1]?.reason, "VPS not reachable");
  assert.equal(result.canSwitch, true);
});

test("a running job on the current profile prevents leaving it", () => {
  const result = profileSwitch({ ...input, jobs: [{ profileId: local.id, state: "running" }] });

  assert.equal(result.options[0]?.current, true);
  assert.equal(result.options[0]?.disabled, true);
  assert.equal(result.options[0]?.reason, "A job is running on this profile");
  assert.equal(result.options[1]?.disabled, true);
  assert.equal(result.options[1]?.reason, "A job is running on the current profile");
  assert.equal(result.canSwitch, false);
});

test("a waiting job holds the current profile and leaves other profiles available", () => {
  const result = profileSwitch({ ...input, jobs: [{ profileId: local.id, state: "waiting" }] });

  assert.equal(result.options[0]?.disabled, true);
  assert.equal(result.options[0]?.reason, "A job is running on this profile");
  assert.equal(result.options[1]?.disabled, false);
  assert.equal(result.canSwitch, true);
});

test("no profiles shows a Settings empty state", () => {
  assert.deepEqual(profileSwitch({ ...input, profiles: [] }), {
    options: [],
    canSwitch: false,
    emptyLine: "Add a browser profile in Settings.",
  });
});

test("profile options discard extra CDP metadata", () => {
  const profile = { ...cloud, cdpUrlName: "TEST_CDP_URL_NAME", cdpUrl: "ws://browser.invalid/devtools" };
  const result = profileSwitch({ ...input, profiles: [profile] });
  const serialized = JSON.stringify(result);

  for (const value of ["cdpUrlName", "cdpUrl", profile.cdpUrlName, profile.cdpUrl]) {
    assert.equal(serialized.includes(value), false);
  }
});
