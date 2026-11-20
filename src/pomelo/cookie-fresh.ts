export type ImportCookieDropReason = "expired" | "wrong site" | "too big" | "bad" | "site limit";

export type ImportCookieSiteCounts = {
  site: string;
  kept: number;
  expired: number;
  wrongSite: number;
  tooBig: number;
  bad: number;
};

export type ImportCookieLimits = {
  maxCookieBytes?: number;
  maxPerSite?: number;
};

export type ImportCookieSortResult = {
  keep: number[];
  drop: { index: number; site: string; why: ImportCookieDropReason }[];
  perSite: ImportCookieSiteCounts[];
};

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UNKNOWN_SITE = "(unknown site)";
const UNREADABLE = Symbol();
const DROP_COUNT = {
  expired: "expired",
  "wrong site": "wrongSite",
  "too big": "tooBig",
  bad: "bad",
  // The per-site report has no separate counter for capacity drops.
  "site limit": "bad",
} as const;

function hostname(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const host = value.replace(/^\./, "").replace(/\.$/, "").toLowerCase();
  if (host.length <= 253 && host.split(".").every((label) => HOST_LABEL.test(label))) return host;
}

function ownField(record: object, key: PropertyKey): unknown {
  const field = Object.getOwnPropertyDescriptor(record, key);
  if (!field) return undefined;
  return "value" in field ? field.value : UNREADABLE;
}

function checkCookie(
  cookies: readonly unknown[],
  index: number,
  chosenHosts: readonly string[],
  nowSeconds: number,
  maxCookieBytes: number,
): { site: string; why?: ImportCookieDropReason } {
  let site = UNKNOWN_SITE;
  try {
    const cookie = ownField(cookies, index);
    if (cookie === null || typeof cookie !== "object" || Array.isArray(cookie)) return { site, why: "bad" };

    const host = hostname(ownField(cookie, "domain"));
    if (!host) return { site, why: "bad" };
    const chosen = chosenHosts.find((candidate) => host === candidate || host.endsWith(`.${candidate}`));
    site = chosen ?? host;

    // The companion's Chrome expirationDate is optional and uses Unix seconds.
    const expirationDate = ownField(cookie, "expirationDate");
    if (expirationDate !== undefined && (typeof expirationDate !== "number" || !Number.isFinite(expirationDate))) {
      return { site, why: "bad" };
    }
    if (!chosen) return { site, why: "wrong site" };
    if (expirationDate !== undefined && expirationDate <= nowSeconds) return { site, why: "expired" };

    const name = ownField(cookie, "name");
    const value = ownField(cookie, "value");
    if (typeof name !== "string" || typeof value !== "string") return { site, why: "bad" };
    if (Buffer.byteLength(name) + Buffer.byteLength(value) > maxCookieBytes) return { site, why: "too big" };
    return { site };
  } catch {
    return { site, why: "bad" };
  }
}

/** Classifies companion cookies in input order using only the supplied Unix time in milliseconds. */
export function sortImportCookies(
  cookies: readonly unknown[],
  chosenSites: readonly string[],
  nowMs: number,
  { maxCookieBytes = 4096, maxPerSite = 3000 }: ImportCookieLimits = {},
): ImportCookieSortResult {
  const keep: ImportCookieSortResult["keep"] = [];
  const drop: ImportCookieSortResult["drop"] = [];
  const perSite = new Map<string, ImportCookieSiteCounts>();
  function countsFor(site: string): ImportCookieSiteCounts {
    let counts = perSite.get(site);
    if (!counts) {
      counts = { site, kept: 0, expired: 0, wrongSite: 0, tooBig: 0, bad: 0 };
      perSite.set(site, counts);
    }
    return counts;
  }

  for (const chosen of chosenSites) {
    const host = hostname(chosen);
    if (host) countsFor(host);
  }
  // Overlapping selections credit a cookie to the most specific match.
  const chosenHosts = [...perSite.keys()].sort((a, b) => b.length - a.length);
  const nowSeconds = nowMs / 1000;

  for (let index = 0; index < cookies.length; index++) {
    const checked = checkCookie(cookies, index, chosenHosts, nowSeconds, maxCookieBytes);
    const { site } = checked;
    const counts = countsFor(site);
    const why = checked.why ?? (counts.kept >= maxPerSite ? "site limit" : undefined);
    if (why) {
      drop.push({ index, site, why });
      counts[DROP_COUNT[why]]++;
    } else {
      keep.push(index);
      counts.kept++;
    }
  }
  return { keep, drop, perSite: [...perSite.values()] };
}
