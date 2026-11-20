export const MAX_REDIRECT_HOPS = 5;

export interface RedirectHop {
  address: string;
  status: number;
}

export interface RedirectChainInput {
  /** In navigation order, including the initial request and the final response. */
  hops: readonly RedirectHop[];
  /** Hostname of the site the job started for. */
  startSite: string;
  hasFillGrant: boolean;
}

export type RedirectChainResult =
  | { decision: "allow"; message: string; reason?: never; host?: never }
  | { decision: "hold"; reason: "downgrade" | "private-network" | "new-site"; host: string; message: string }
  | { decision: "refuse"; reason: "too-many-hops" | "empty-chain" | "bad-address" | "unsupported-scheme" | "loop"; host?: string; message: string };

const ipv4Hostname = /^\d+\.\d+\.\d+\.\d+$/;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function siteFor(host: string): string {
  if (host.startsWith("[") || ipv4Hostname.test(host)) return host;
  // Use the last two DNS labels as a stand-in for the registrable site without a public suffix list.
  return host.split(".").slice(-2).join(".");
}

function isPrivateIPv4(first: number, second: number, third: number, fourth: number): boolean {
  return first === 10 || first === 127 ||
    (first === 0 && second === 0 && third === 0 && fourth === 0) ||
    (first === 100 && second >= 64 && second <= 127) || // Shared address space, used by tailnets.
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

function isPrivateHost(host: string): boolean {
  // URL canonicalizes IPv4 and IPv6 literals before they reach this check.
  if (ipv4Hostname.test(host)) {
    const [first, second, third, fourth] = host.split(".").map(Number);
    return isPrivateIPv4(first, second, third, fourth);
  }
  if (host.startsWith("[")) {
    if (host === "[::]" || host === "[::1]") return true;

    const literal = host.slice(1, -1);
    const first = parseInt(literal.split(":")[0], 16);
    if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return true;

    // URL writes IPv4-mapped IPv6 literals with the last 32 bits in two hex groups.
    if (literal.startsWith("::ffff:")) {
      const [high, low] = literal.slice(7).split(":").map((group) => parseInt(group, 16));
      return isPrivateIPv4(high >> 8, high & 0xff, low >> 8, low & 0xff);
    }
    return false;
  }
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal");
}

/** Checks recorded hops without making requests or resolving hostnames. */
export function checkRedirectChain({ hops, startSite, hasFillGrant }: RedirectChainInput): RedirectChainResult {
  if (hops.length === 0) {
    return { decision: "refuse", reason: "empty-chain", message: "There are no navigation hops to check." };
  }
  if (hops.length > MAX_REDIRECT_HOPS) {
    return { decision: "refuse", reason: "too-many-hops", message: `Navigation exceeded the limit of ${MAX_REDIRECT_HOPS} hops.` };
  }

  const seen = new Set<string>();
  let previousProtocol: string | undefined;
  let firstHold: RedirectChainResult | undefined;

  for (const [index, { address }] of hops.entries()) {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return { decision: "refuse", reason: "bad-address", message: "The address is invalid." };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { decision: "refuse", reason: "unsupported-scheme", message: "This address uses an unsupported scheme." };
    }

    const host = normalizeHostname(url.hostname);
    url.hash = ""; // Fragments do not change the HTTP request address.
    if (seen.has(url.href)) {
      return { decision: "refuse", reason: "loop", host, message: `Navigation repeated an address on ${host}.` };
    }
    seen.add(url.href);

    if (!firstHold) {
      if (previousProtocol === "https:" && url.protocol === "http:") {
        firstHold = { decision: "hold", reason: "downgrade", host, message: `Switching to plain HTTP on ${host} requires approval.` };
      } else if (isPrivateHost(host)) {
        firstHold = { decision: "hold", reason: "private-network", host, message: `This private network address (${host}) requires approval.` };
      } else if (index === hops.length - 1 && hasFillGrant && siteFor(host) !== siteFor(normalizeHostname(startSite))) {
        firstHold = { decision: "hold", reason: "new-site", host, message: `Opening ${host} with a fill grant for another site requires approval.` };
      }
    }
    previousProtocol = url.protocol;
  }

  return firstHold ?? { decision: "allow", message: "Navigation can continue." };
}
