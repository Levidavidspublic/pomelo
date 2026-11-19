import { isIP } from "node:net";
import type { BrowserProfile } from "../browser-records.js";

export type MoveRefusal =
  | "wrong-direction"
  | "not-tailnet"
  | "not-encrypted-in-transit"
  | "not-encrypted-at-rest"
  | "key-not-a-reference";

export interface ProfileMoveRequest {
  fromLocation: BrowserProfile["location"];
  toLocation: BrowserProfile["location"];
  targetHost: string;
  encryptedInTransit: boolean;
  encryptedAtRest: boolean;
  keyRef?: string;
}

function isTailnetIPv4(ip: string): boolean {
  const [first, second] = ip.split(".").map(Number);
  return first === 100 && second >= 64 && second <= 127;
}

/** Check a bare IP literal against the Tailscale address ranges. */
export function isTailnetAddress(host: string): boolean {
  if (typeof host !== "string") return false;
  const version = isIP(host);
  if (version === 4) return isTailnetIPv4(host);
  if (version !== 6 || host.includes("%")) return false;
  if (/^fd7a:115c:a1e0:/i.test(host)) return true;

  // A validated IPv4-mapped IPv6 literal has five zero groups before ffff.
  const mappedIPv4 = /^[0:]+ffff:(.+)$/i.exec(host)?.[1];
  if (!mappedIPv4) return false;
  if (mappedIPv4.includes(".")) return isTailnetIPv4(mappedIPv4);
  // In hex, 100.64 through 100.127 occupy the high group 6440 through 647f.
  return /^64[4-7][0-9a-f]:[0-9a-f]{1,4}$/i.test(mappedIPv4);
}

export function checkProfileMove(req: ProfileMoveRequest): { ok: true } | { ok: false; reason: MoveRefusal } {
  if (req.fromLocation !== "local" || req.toLocation !== "cloud") return { ok: false, reason: "wrong-direction" };
  if (!isTailnetAddress(req.targetHost)) return { ok: false, reason: "not-tailnet" };
  if (req.encryptedInTransit !== true) return { ok: false, reason: "not-encrypted-in-transit" };
  if (req.encryptedAtRest !== true) return { ok: false, reason: "not-encrypted-at-rest" };

  const { keyRef } = req;
  const prefix = "op://";
  if (typeof keyRef !== "string" || !keyRef.startsWith(prefix) || keyRef.length === prefix.length) {
    return { ok: false, reason: "key-not-a-reference" };
  }
  return { ok: true };
}
