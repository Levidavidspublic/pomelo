export const SITE_PERMISSIONS = Object.freeze([
  "camera", "microphone", "geolocation", "notifications", "clipboard-read", "clipboard-write",
] as const);

export type SitePermission = (typeof SITE_PERMISSIONS)[number];

export interface SitePermissionRequest {
  permission: string;
  origin: string;
  frame: "top" | "child";
  target: "local" | "cloud";
}

export interface SitePermissionAllowEntry {
  origin: string;
  permission: SitePermission;
}

export type SitePermissionResult =
  | { decision: "allow"; reason: "allowed" }
  | { decision: "hold"; reason: "needs-amit" }
  | {
      decision: "deny";
      reason:
        | "not-allowed"
        | "no-device-on-cloud"
        | "clipboard-read-blocked"
        | "child-frame"
        | "insecure-origin"
        | "unknown-permission"
        | "bad-input";
    };

const badInput = Object.freeze({ decision: "deny", reason: "bad-input" } as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSitePermission(value: unknown): value is SitePermission {
  return SITE_PERMISSIONS.some((permission) => permission === value);
}

function parseOrigin(value: unknown): URL | undefined {
  if (typeof value !== "string") return undefined;
  const url = new URL(value);
  if (url.hostname.includes("*")) return undefined;

  if (url.protocol === "http:" || url.protocol === "https:") {
    // Compare serialized origins, allowing host case without stripping parts of a page URL.
    const prefix = url.protocol + "//";
    if (!value.startsWith(prefix) || value.slice(prefix.length).toLowerCase() !== url.host) {
      return undefined;
    }
  }
  return url;
}

export function sitePermission(request: unknown, allowList: unknown): SitePermissionResult {
  try {
    if (!isRecord(request) || !Array.isArray(allowList)) return badInput;
    const { permission, origin, frame, target } = request;
    if (typeof permission !== "string" ||
        (frame !== "top" && frame !== "child") ||
        (target !== "local" && target !== "cloud")) {
      return badInput;
    }
    const site = parseOrigin(origin);
    if (!site) return badInput;
    if (!isSitePermission(permission)) return { decision: "deny", reason: "unknown-permission" };

    let allowed = false;
    for (let index = 0; index < allowList.length; index++) {
      const entry: unknown = allowList[index];
      if (!isRecord(entry)) return badInput;
      const { origin: entryOrigin, permission: entryPermission } = entry;
      if (!isSitePermission(entryPermission)) return badInput;
      const entrySite = parseOrigin(entryOrigin);
      if (!entrySite) return badInput;
      if (entryPermission === permission &&
          entrySite.protocol === site.protocol &&
          entrySite.origin === site.origin) {
        allowed = true;
      }
    }

    if (permission === "clipboard-read") return { decision: "deny", reason: "clipboard-read-blocked" };
    if (frame === "child") return { decision: "deny", reason: "child-frame" };

    const https = site.protocol === "https:";
    const loopback = site.protocol === "http:" && (site.hostname === "localhost" || site.hostname === "127.0.0.1");
    if (!https && (!loopback || permission === "clipboard-write")) {
      return { decision: "deny", reason: "insecure-origin" };
    }
    if (permission === "clipboard-write") return { decision: "allow", reason: "allowed" };
    if (permission === "notifications") {
      return allowed ? { decision: "allow", reason: "allowed" } : { decision: "deny", reason: "not-allowed" };
    }
    if (target === "cloud") return { decision: "deny", reason: "no-device-on-cloud" };
    return allowed ? { decision: "allow", reason: "allowed" } : { decision: "hold", reason: "needs-amit" };
  } catch {
    return badInput;
  }
}
