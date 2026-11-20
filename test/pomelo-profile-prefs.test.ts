import assert from "node:assert/strict";
import test from "node:test";
import { buildProfilePrefs, checkProfilePrefs, PROTECTED_PROFILE_PREFS } from "../src/pomelo/browser/profile-prefs.js";

test("profile preferences are frozen and put each safe value at its Chromium path", () => {
  const prefs = buildProfilePrefs();
  assert.deepEqual(prefs, {
    credentials_enable_service: false,
    profile: { password_manager_enabled: false, password_manager_leak_detection: false },
    autofill: { profile_enabled: false, credit_card_enabled: false, wallet_import_enabled: false },
    signin: { allowed: false, allowed_on_next_startup: false },
    sync: { requested: false },
  });
  assert.ok(Object.isFrozen(prefs));
  for (const section of Object.values(prefs)) {
    if (typeof section === "object") assert.ok(Object.isFrozen(section));
  }
  assert.deepEqual(buildProfilePrefs(), prefs);
  assert.deepEqual(checkProfilePrefs(prefs), []);
  assert.deepEqual(checkProfilePrefs(JSON.parse(JSON.stringify(prefs))), []);
});

test("each enabled preference is reported under its protected dotted key", () => {
  assert.ok(Object.isFrozen(PROTECTED_PROFILE_PREFS));
  assert.deepEqual(PROTECTED_PROFILE_PREFS, {
    credentials_enable_service: false,
    "profile.password_manager_enabled": false,
    "profile.password_manager_leak_detection": false,
    "autofill.profile_enabled": false,
    "autofill.credit_card_enabled": false,
    "autofill.wallet_import_enabled": false,
    "signin.allowed": false,
    "signin.allowed_on_next_startup": false,
    "sync.requested": false,
  });

  for (const key of Object.keys(PROTECTED_PROFILE_PREFS)) {
    const prefs: Record<string, unknown> = structuredClone(buildProfilePrefs());
    const [group, name] = key.split(".");
    const section = name === undefined ? prefs : prefs[group];
    assert.ok(section && typeof section === "object");
    Object.defineProperty(section, name ?? group, { value: true });
    assert.deepEqual(checkProfilePrefs(prefs), [key]);
  }
});

test("missing and malformed protected values yield only their key names", () => {
  const prefs = {
    ...buildProfilePrefs(),
    profile: { password_manager_enabled: "fixture-marker" },
    sync: { requested: 0 },
  };
  assert.deepEqual(checkProfilePrefs(prefs), [
    "profile.password_manager_enabled",
    "profile.password_manager_leak_detection",
    "sync.requested",
  ]);
  assert.deepEqual(checkProfilePrefs({}), Object.keys(PROTECTED_PROFILE_PREFS));
});

test("unknown preferences are ignored and preserved", () => {
  const base = buildProfilePrefs();
  const prefs = Object.freeze({
    ...base,
    profile: Object.freeze({ ...base.profile, display_label: "fixture-label" }),
    extra: true,
  });
  assert.deepEqual(checkProfilePrefs(prefs), []);
  assert.equal(prefs.profile.display_label, "fixture-label");
  assert.equal(prefs.extra, true);
});

test("only own data properties at the Chromium path count as protected values", () => {
  const inherited: object = Object.create({ requested: false });
  const accessor = {
    get requested() {
      return assert.fail("preference accessors must not be invoked");
    },
  };
  for (const sync of [inherited, accessor, null, [], false]) {
    const prefs = { ...buildProfilePrefs(), sync, "sync.requested": false };
    assert.deepEqual(checkProfilePrefs(prefs), ["sync.requested"]);
  }
});

test("non-object preferences are unreadable", () => {
  for (const prefs of [null, [], "fixture-marker", undefined, false]) {
    assert.deepEqual(checkProfilePrefs(prefs), ["unreadable"]);
  }
});
