type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "None" | "Lax" | "Strict";
};

type SiteResult = {
  site: string;
  result: "imported" | "expired" | "incompatible" | "skipped";
  counts: { imported: number; expired: number; incompatible: number };
};

function hostOf(domain: string): string {
  return domain.replace(/^\./, "").toLowerCase();
}

function browserSameSite(sameSite: unknown): BrowserCookie["sameSite"] {
  switch (sameSite) {
    case "no_restriction": return "None";
    case "lax": return "Lax";
    case "strict": return "Strict";
    default: return undefined;
  }
}

/** Maps extension cookies in memory. Both now and expirationDate are Unix seconds. */
export function mapChromeCookies(
  input: readonly unknown[],
  { sites, now }: { sites: readonly string[]; now: number },
): { cookies: BrowserCookie[]; report: SiteResult[] } {
  const cookies: BrowserCookie[] = [];
  const report = new Map<string, SiteResult>();
  function resultFor(site: string): SiteResult {
    let result = report.get(site);
    if (!result) {
      result = { site, result: "skipped", counts: { imported: 0, expired: 0, incompatible: 0 } };
      report.set(site, result);
    }
    return result;
  }

  // An overlapping selection credits each cookie to the most specific site.
  const chosen = sites.map((site) => ({ host: hostOf(site), result: resultFor(site) }));
  chosen.sort((a, b) => b.host.length - a.host.length);

  for (const item of input) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      resultFor("(unknown site)").counts.incompatible++;
      continue;
    }

    const { name, value, domain, path, expirationDate, session, httpOnly, secure, sameSite, hostOnly, partitionKey } =
      item as Record<string, unknown>;
    const host = typeof domain === "string" ? hostOf(domain) : "";
    const site = chosen.find((entry) => entry.host === host || host.endsWith(`.${entry.host}`))?.result;
    if (!host || typeof name !== "string" || typeof value !== "string" || typeof domain !== "string") {
      (site ?? resultFor("(unknown site)")).counts.incompatible++;
      continue;
    }
    if (!site) {
      resultFor(host);
      continue;
    }

    const expires = session === true ? undefined : expirationDate;
    // The browser cookie shape cannot preserve a Chrome partition key.
    if (partitionKey !== undefined
      || typeof path !== "string" || !path.startsWith("/") || typeof httpOnly !== "boolean" || typeof secure !== "boolean"
      || (expires !== undefined && (typeof expires !== "number" || !Number.isFinite(expires)))
      || (name.startsWith("__Secure-") && !secure)
      || (name.startsWith("__Host-") && (!secure || hostOnly === false || domain.startsWith(".") || path !== "/"))) {
      site.counts.incompatible++;
      continue;
    }
    if (expires !== undefined && expires < now) {
      site.counts.expired++;
      continue;
    }

    const mapped: BrowserCookie = { name, value, domain, path, httpOnly, secure };
    if (expires !== undefined) mapped.expires = expires;
    const mappedSameSite = browserSameSite(sameSite);
    if (mappedSameSite !== undefined) mapped.sameSite = mappedSameSite;
    cookies.push(mapped);
    site.counts.imported++;
  }

  for (const result of report.values()) {
    const { imported, incompatible, expired } = result.counts;
    if (imported) result.result = "imported";
    else if (incompatible) result.result = "incompatible";
    else if (expired) result.result = "expired";
  }
  return { cookies, report: [...report.values()] };
}
