import { isIP } from "node:net";

export type PageInFront = Readonly<{
  topOrigin: string;
  frameOrigin: string;
}>;

export type SavedRef = Readonly<{
  id: string;
  label: string;
  allowedOrigins: readonly string[];
  account?: string;
  revoked?: boolean;
}>;

type RefChoice = { refId: string; label: string };

export type RefPick =
  | ({ decision: "use" } & RefChoice)
  | { decision: "ask"; choices: RefChoice[] }
  | { decision: "hold"; reason: string };

function parseOrigin(address: string): URL | null {
  try {
    const url = new URL(address);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname.includes("*")) return null;
    return url;
  } catch {
    return null;
  }
}

function sameOrigin(first: URL, second: URL): boolean {
  // URL represents omitted and explicit default ports the same way.
  return first.protocol === second.protocol && first.hostname === second.hostname && first.port === second.port;
}

function compareText(first: string, second: string): number {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

const vaultReferenceScheme = /op:\/\//i;

export function pickReference(page: PageInFront, refs: readonly SavedRef[], wanted?: { account?: string }): RefPick {
  const top = parseOrigin(page.topOrigin);
  const frame = parseOrigin(page.frameOrigin);
  if (!top || !frame) return { decision: "hold", reason: "The page or frame origin is invalid or unsupported." };
  if (!sameOrigin(top, frame)) return { decision: "hold", reason: "The frame has a different origin from the page." };

  const { hostname, protocol } = top;
  if (/(^|\.)xn--/.test(hostname)) return { decision: "hold", reason: "The host uses punycode." };

  const ipVersion = isIP(hostname.startsWith("[") ? hostname.slice(1, -1) : hostname);
  const loopback = hostname === "localhost" || hostname === "[::1]" ||
    (ipVersion === 4 && hostname.startsWith("127."));
  if (protocol === "http:" && !loopback) return { decision: "hold", reason: "Plain HTTP is allowed only on loopback." };
  if (ipVersion && protocol === "https:") return { decision: "hold", reason: "The host is an IP address." };

  const choices: RefChoice[] = [];
  const account = wanted?.account;
  for (const ref of refs) {
    if (ref.revoked || (account !== undefined && ref.account !== account)) continue;
    if (vaultReferenceScheme.test(ref.id) || vaultReferenceScheme.test(ref.label)) continue;
    if (ref.allowedOrigins.some((address) => {
      const allowed = parseOrigin(address);
      return allowed !== null && sameOrigin(top, allowed);
    })) {
      choices.push({ refId: ref.id, label: ref.label });
    }
  }

  if (choices.length === 0) return { decision: "hold", reason: "No saved reference matches this fill request." };
  if (choices.length === 1) return { decision: "use", ...choices[0]! };
  choices.sort((first, second) => compareText(first.label, second.label) || compareText(first.refId, second.refId));
  return { decision: "ask", choices };
}
