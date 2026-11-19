export type FillGrant = Readonly<{
  /** The browser's serialized origin. */
  origin: string;
  frame: "top" | "same-origin";
}>;

export type FillTarget = Readonly<{
  pageUrl: string;
  frameUrl: string;
  isTopFrame: boolean;
}>;

export type FillDecision = {
  decision: "allow" | "refuse";
  reason: string;
};

function parseFillUrl(address: string): URL | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }

  const { hostname, protocol } = url;
  if (protocol !== "https:" &&
    !(protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1"))) {
    return null;
  }
  if (hostname.endsWith(".") || /(^|\.)xn--/.test(hostname)) return null;

  // Check the original host spelling before URL normalization hides aliases such as %65xample.com or 127.1.
  const rawHost = /^https?:\/\/(?:[^/?#\\]*@)?(\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?=[:/?#]|$)/i.exec(address)?.[1];
  if (!rawHost || (!rawHost.startsWith("[") && rawHost.toLowerCase() !== hostname)) return null;
  return url;
}

export function checkFillTarget(grant: FillGrant, target: FillTarget): FillDecision {
  const page = parseFillUrl(target.pageUrl);
  if (!page) return { decision: "refuse", reason: "The page address is unsupported." };
  if (page.origin !== grant.origin) {
    return { decision: "refuse", reason: `The page on ${page.hostname} is outside the granted origin.` };
  }

  const frame = parseFillUrl(target.frameUrl);
  if (!frame) return { decision: "refuse", reason: "The frame address is unsupported." };
  if (frame.origin !== page.origin) {
    return { decision: "refuse", reason: `The frame on ${frame.hostname} has a different origin from the page.` };
  }
  if (!target.isTopFrame && grant.frame !== "same-origin") {
    return { decision: "refuse", reason: `The grant only allows the top frame on ${page.hostname}.` };
  }
  return { decision: "allow", reason: `The fill target on ${page.hostname} matches the grant.` };
}
