import { isIP } from "node:net";

export type NavigationVerdict = "go" | "ask" | "refuse";

export interface NavigationCheckOptions {
  allowPrivate?: boolean;
  /** Exact hostnames without ports. */
  allowedHosts?: readonly string[];
}

export interface NavigationCheckResult {
  verdict: NavigationVerdict;
  reason: string;
  /** The parsed HTTP or HTTPS origin, when available. */
  origin: string | null;
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    const literal = normalized.slice(1, -1);
    if (isIP(literal) === 6) return literal;
  }
  return normalized;
}

function isPrivateIPv4(first: number, second: number, third: number, fourth: number): boolean {
  return (
    (first === 0 && second === 0 && third === 0 && fourth === 0) ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) || // Shared address space, used by tailnets.
    (first === 169 && second === 254) || // Link-local, including cloud metadata.
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIPv6(host: string): boolean {
  if (host === "::" || host === "::1") return true;

  // URL serializes IPv6 as hex, including the last two groups of mapped addresses.
  const [head, tail] = host.split("::");
  const leading = head ? head.split(":") : [];
  const trailing = tail ? tail.split(":") : [];
  const groups = [...leading, ...Array<string>(8 - leading.length - trailing.length).fill("0"), ...trailing]
    .map((group) => parseInt(group, 16));
  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return true;

  if (groups[5] === 0xffff && groups.slice(0, 5).every((group) => group === 0)) {
    const high = groups[6];
    const low = groups[7];
    return isPrivateIPv4(high >> 8, high & 0xff, low >> 8, low & 0xff);
  }
  return false;
}

function isPrivateHost(host: string): boolean {
  switch (isIP(host)) {
    case 4: {
      const [first, second, third, fourth] = host.split(".").map(Number);
      return isPrivateIPv4(first, second, third, fourth);
    }
    case 6:
      return isPrivateIPv6(host);
    default:
      return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal");
  }
}

/** Checks the address before navigation, without resolving hostnames. */
export function navigationCheck(address: string, options: NavigationCheckOptions = {}): NavigationCheckResult {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { verdict: "refuse", reason: "The address is invalid.", origin: null };
  }

  if (url.href === "about:blank") {
    return { verdict: "go", reason: "The blank page may open.", origin: null };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { verdict: "refuse", reason: "This address uses an unsupported scheme.", origin: null };
  }

  const { origin } = url;
  if (url.username || url.password) {
    return { verdict: "refuse", reason: "The address contains a username or password.", origin };
  }

  const host = normalizeHostname(url.hostname);
  if (
    isPrivateHost(host) &&
    options.allowPrivate !== true &&
    !options.allowedHosts?.some((allowedHost) => normalizeHostname(allowedHost) === host)
  ) {
    return { verdict: "ask", reason: "This private network address requires approval.", origin };
  }
  return { verdict: "go", reason: "The address may open.", origin };
}
