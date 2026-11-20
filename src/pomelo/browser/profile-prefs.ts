const PROFILE_PREFS = Object.freeze({
  // This preference controls the browser's offer to save passwords.
  credentials_enable_service: false,
  profile: Object.freeze({
    password_manager_enabled: false,
    password_manager_leak_detection: false,
  }),
  autofill: Object.freeze({
    profile_enabled: false,
    // The card setting controls both saving and filling payment methods.
    credit_card_enabled: false,
    wallet_import_enabled: false,
  }),
  signin: Object.freeze({
    allowed: false,
    allowed_on_next_startup: false,
  }),
  sync: Object.freeze({ requested: false }),
});

/** Chromium preference paths and their required values. */
export const PROTECTED_PROFILE_PREFS: Readonly<Record<string, boolean>> = Object.freeze(
  Object.fromEntries(Object.entries(PROFILE_PREFS).flatMap<[string, boolean]>(([group, prefs]) => {
    if (typeof prefs === "boolean") return [[group, prefs]];
    return Object.entries(prefs).map(([name, value]) => [`${group}.${name}`, value]);
  })),
);

/** Return the nested object used by Chromium's Preferences JSON. */
export function buildProfilePrefs(): typeof PROFILE_PREFS {
  return PROFILE_PREFS;
}

function isPrefsObject(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readPref(prefs: object, key: string): unknown {
  let value: unknown = prefs;
  for (const segment of key.split(".")) {
    if (!isPrefsObject(value)) return undefined;
    value = Object.getOwnPropertyDescriptor(value, segment)?.value;
  }
  return value;
}

/** Report missing or unsafe preferences by name so callers can hold the job. */
export function checkProfilePrefs(prefs: unknown): string[] {
  try {
    if (!isPrefsObject(prefs)) return ["unreadable"];

    const findings: string[] = [];
    for (const [key, safeValue] of Object.entries(PROTECTED_PROFILE_PREFS)) {
      if (readPref(prefs, key) !== safeValue) findings.push(key);
    }
    return findings;
  } catch {
    return ["unreadable"];
  }
}
