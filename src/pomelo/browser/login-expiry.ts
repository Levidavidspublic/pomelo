const DAY_MS = 86_400_000;

export interface LoginExpirySite {
  site: string;
  /** Expiry timestamps in milliseconds. Zero or an omitted timestamp represents a session cookie. */
  expiries: readonly (number | undefined)[];
}

export interface LoginExpiryOptions {
  soonDays?: number;
}

export interface LoginExpiryRow {
  site: string;
  state: "ok" | "soon" | "expired" | "session-only" | "unknown";
  /** Fractional days remaining, zero once expired, or null when there is no dated expiry. */
  daysLeft: number | null;
}

export interface LoginExpiryResult {
  rows: LoginExpiryRow[];
  needsImport: string[];
  summary: string;
}

export function checkLoginExpiry(
  sites: readonly LoginExpirySite[],
  nowMs: number,
  { soonDays = 3 }: LoginExpiryOptions = {},
): LoginExpiryResult {
  const rows = sites.map(({ site, expiries }): LoginExpiryRow => {
    let latest: number | undefined;
    for (const expiry of expiries) {
      if (expiry === undefined || expiry === 0 || !Number.isFinite(expiry)) continue;
      if (latest === undefined || expiry > latest) latest = expiry;
    }

    if (latest === undefined) {
      const sessionOnly = expiries.length > 0 && expiries.every((expiry) => expiry === 0 || expiry === undefined);
      return { site, state: sessionOnly ? "session-only" : "unknown", daysLeft: null };
    }

    const daysLeft = (latest - nowMs) / DAY_MS;
    if (daysLeft <= 0) return { site, state: "expired", daysLeft: 0 };
    return { site, state: daysLeft <= soonDays ? "soon" : "ok", daysLeft };
  });

  const needsImport = rows
    .filter(({ state }) => state === "expired" || state === "soon")
    .map(({ site }) => site)
    .sort();
  const summary = needsImport.length === 1
    ? "1 sign-in needs a new import"
    : `${needsImport.length} sign-ins need a new import`;

  return { rows, needsImport, summary };
}
