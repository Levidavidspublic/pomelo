export interface SiteScopeInput {
  /** Exact hostnames the job started with, without ports. */
  scope: readonly string[];
  fromUrl: string;
  toUrl: string;
  /** The caller supplies "user-approved" only after the user approves this step. */
  reason: string;
  hasLiveGrant: boolean;
}

export interface SiteScopeResult {
  verdict: "allow" | "hold" | "refuse";
  why: string;
  grantAction: "none" | "revoke-first";
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function hostnameFromUrl(address: string): string {
  try {
    return normalizeHostname(new URL(address).hostname);
  } catch {
    return "";
  }
}

/** Check whether a navigation step may leave the job's original host scope. */
export function siteScopeCheck({ scope, fromUrl, toUrl, reason, hasLiveGrant }: SiteScopeInput): SiteScopeResult {
  const fromHost = hostnameFromUrl(fromUrl);
  const toHost = hostnameFromUrl(toUrl);
  const inScope = toHost !== "" && scope.some((host) => normalizeHostname(host) === toHost);
  const grantAction = toHost && !inScope && hasLiveGrant ? "revoke-first" : "none";

  if (!fromHost || !toHost) {
    return { verdict: "refuse", why: "This job needs valid addresses with hostnames.", grantAction };
  }
  if (inScope) {
    return { verdict: "allow", why: `This job may open ${toHost}`, grantAction };
  }
  if (reason === "user-approved") {
    return { verdict: "allow", why: `The user approved this job's move from ${fromHost} to ${toHost}`, grantAction };
  }
  return { verdict: "hold", why: `This job wants to leave ${fromHost} for ${toHost}`, grantAction };
}
