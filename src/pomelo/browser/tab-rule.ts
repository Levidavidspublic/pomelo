export interface TabOpenRequest {
  source: "job" | "page";
  url: string;
  openerUrl?: string;
}

export interface TabOpenLimits {
  maxTabs?: number;
}

export interface TabOpenInput {
  openTabs: number;
  request: TabOpenRequest;
  limits?: TabOpenLimits;
}

export interface TabOpenResult {
  decision: "allow" | "hold" | "refuse";
  reason: string;
}

const DEFAULT_MAX_TABS = 5;

function parseUrl(address: string): URL | null {
  try {
    return new URL(address);
  } catch {
    return null;
  }
}

/** Decide whether a browser job can open one more tab. */
export function checkTabOpen({ openTabs, request, limits }: TabOpenInput): TabOpenResult {
  const target = parseUrl(request.url);
  if (!target) {
    return { decision: "refuse", reason: "Opening a tab needs a valid address." };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { decision: "refuse", reason: "Only HTTP and HTTPS addresses can open in a new tab." };
  }

  const maxTabs = limits?.maxTabs ?? DEFAULT_MAX_TABS;
  if (openTabs >= maxTabs) {
    const tabs = maxTabs === 1 ? "tab" : "tabs";
    return { decision: "hold", reason: `This browser job has reached its limit of ${maxTabs} open ${tabs}.` };
  }

  if (request.source === "page") {
    const opener = parseUrl(request.openerUrl ?? "");
    if (!opener || (opener.protocol !== "http:" && opener.protocol !== "https:")) {
      return { decision: "hold", reason: "The pop-up's opener has no valid web address. Opening it needs approval." };
    }
    if (opener.protocol !== target.protocol || opener.host.toLowerCase() !== target.host.toLowerCase()) {
      return { decision: "hold", reason: "The pop-up opens a different site and needs approval." };
    }
    return { decision: "allow", reason: "The pop-up opens on the same site as its opener." };
  }

  return { decision: "allow", reason: "This browser job can open another tab." };
}
