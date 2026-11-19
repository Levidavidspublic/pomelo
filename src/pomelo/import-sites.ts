import { isIP } from "node:net";

export const IMPORT_SITE_LIMIT = 50;

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function parseSite(input: string): { host: string } | { reason: string } {
  const value = input.trim();
  if (value.toLowerCase() === "<all_urls>") return { reason: "Select individual sites." };

  const scheme = /^([a-z][a-z\d+.-]*):\/\//i.exec(value);
  if (scheme && scheme[1].toLowerCase() !== "https") return { reason: "Use an HTTPS URL." };

  const address = value.slice(scheme?.[0].length ?? 0);
  const authority = address.split(/[/?#\\]/, 1)[0];
  if (!authority || /[\t\n\r]/.test(authority)) return { reason: "Enter a valid site host." };
  if (authority.includes("@")) return { reason: "Remove user info from the URL." };
  if (authority.includes("*")) return { reason: "Remove the wildcard from the host." };

  let url: URL;
  try {
    url = new URL(scheme ? value : `https://${value}`);
  } catch {
    return { reason: "Enter a valid host or HTTPS URL." };
  }

  const host = url.hostname.replace(/\.$/, "");
  if (isIP(host.replace(/^\[|\]$/g, ""))) return { reason: "Use a domain name instead of an IP address." };
  // URL drops the default HTTPS port, so check the original authority too.
  if (authority.includes(":")) return { reason: "Remove the port from the host." };
  if (host.includes("*")) return { reason: "Remove the wildcard from the host." };
  if (host === "localhost" || host.endsWith(".localhost")) return { reason: "Use a domain other than localhost." };
  if (!host.includes(".") || host.length > 253 || !host.split(".").every((label) => DOMAIN_LABEL.test(label))) {
    return { reason: "Enter a valid domain name with at least two labels." };
  }
  return { host };
}

export function importSitePatterns(sites: readonly string[]): {
  patterns: string[];
  sites: string[];
  rejected: { input: string; reason: string }[];
} {
  const hosts = new Set<string>();
  const rejected: { input: string; reason: string }[] = [];
  for (const input of sites) {
    const site = parseSite(input);
    let reason: string;
    if ("reason" in site) {
      reason = site.reason;
    } else {
      if (hosts.has(site.host)) continue;
      if (hosts.size < IMPORT_SITE_LIMIT) {
        hosts.add(site.host);
        continue;
      }
      reason = `Select at most ${IMPORT_SITE_LIMIT} sites.`;
    }

    // Malformed URLs can contain user info too, so omit rejected text that contains an @.
    rejected.push({ input: input.includes("@") ? "[redacted]" : input.slice(0, 100), reason });
  }

  const accepted = [...hosts].sort();
  return { sites: accepted, patterns: accepted.map((host) => `https://${host}/*`).sort(), rejected };
}
