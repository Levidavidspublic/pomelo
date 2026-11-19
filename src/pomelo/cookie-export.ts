export type ChromeSetCookie = {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: "no_restriction" | "lax" | "strict";
  expirationDate?: number;
};

export type SiteExport = {
  site: string;
  result: "exported" | "expired" | "incompatible" | "skipped";
  counts: { exported: number; expired: number; incompatible: number };
};

function hostOf(domain: string): string {
  return domain.replace(/^\./, "").toLowerCase();
}

function chromeSameSite(sameSite: unknown): ChromeSetCookie["sameSite"] {
  switch (sameSite) {
    case "None": return "no_restriction";
    case "Lax": return "lax";
    case "Strict": return "strict";
    default: return undefined;
  }
}

/** Maps browser cookies in memory. Both now and expires are Unix seconds. */
export function mapCookiesForChrome(
  input: readonly unknown[],
  { sites, now }: { sites: readonly string[]; now: number },
): { cookies: ChromeSetCookie[]; report: SiteExport[] } {
  const cookies: ChromeSetCookie[] = [];
  const report = new Map<string, SiteExport>();
  const unknownSite = "(unknown site)";

  function resultFor(site: string): SiteExport {
    let result = report.get(site);
    if (!result) {
      result = { site, result: "skipped", counts: { exported: 0, expired: 0, incompatible: 0 } };
      report.set(site, result);
    }
    return result;
  }

  const chosen = sites.map((site) => ({ host: hostOf(site), result: resultFor(site) }));
  chosen.sort((a, b) => b.host.length - a.host.length);

  for (const item of input) {
    let site: SiteExport | undefined;
    try {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        resultFor(unknownSite).counts.incompatible++;
        continue;
      }

      const record = item as Record<string, unknown>;
      const { domain } = record;
      const host = typeof domain === "string" ? hostOf(domain) : "";
      // Require a bare, canonical host before using it for site matching or in the URL.
      if (typeof domain !== "string" || !host || host.startsWith(".") || new URL(`https://${host}/`).hostname !== host) {
        resultFor(unknownSite).counts.incompatible++;
        continue;
      }

      site = chosen.find((entry) => entry.host === host || host.endsWith(`.${entry.host}`))?.result;
      if (!site) {
        resultFor(host);
        continue;
      }

      const { name, value, path, expires, httpOnly, secure, sameSite } = record;
      const domainCookie = domain.startsWith(".");
      if (typeof name !== "string" || typeof value !== "string"
        || typeof path !== "string" || !path.startsWith("/")
        || typeof httpOnly !== "boolean" || typeof secure !== "boolean"
        || (expires !== undefined && (typeof expires !== "number" || !Number.isFinite(expires)))
        || (name.startsWith("__Secure-") && !secure)
        || (name.startsWith("__Host-") && (!secure || domainCookie || path !== "/"))
        || (sameSite === "None" && !secure)
        || "partitionKey" in record) {
        site.counts.incompatible++;
        continue;
      }

      const expirationDate = expires === -1 ? undefined : expires;
      if (expirationDate !== undefined && expirationDate < now) {
        site.counts.expired++;
        continue;
      }

      const url = `${secure ? "https" : "http"}://${host}${path}`;
      const mapped: ChromeSetCookie = { url, name, value, path, secure, httpOnly };
      if (domainCookie) mapped.domain = domain;
      const mappedSameSite = chromeSameSite(sameSite);
      if (mappedSameSite !== undefined) mapped.sameSite = mappedSameSite;
      if (expirationDate !== undefined) mapped.expirationDate = expirationDate;
      cookies.push(mapped);
      site.counts.exported++;
    } catch {
      // A field accessor or URL parser can throw text that belongs to the input.
      (site ?? resultFor(unknownSite)).counts.incompatible++;
    }
  }

  for (const result of report.values()) {
    const { exported, incompatible, expired } = result.counts;
    if (exported) result.result = "exported";
    else if (incompatible) result.result = "incompatible";
    else if (expired) result.result = "expired";
  }
  return { cookies, report: [...report.values()] };
}
