import { timingSafeEqual } from "node:crypto";

export const MAX_IMPORT_COOKIES = 1_000;

const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const CHROME_COOKIE_METADATA = [
  "expirationDate", "hostOnly", "httpOnly", "partitionKey", "path", "sameSite", "secure", "session", "storeId",
] as const;

export interface ImportCookie extends Partial<Record<typeof CHROME_COOKIE_METADATA[number], unknown>> {
  domain: string;
  name: string;
  value: string;
}

type RefusalReason = "not-loopback" | "invalid-message" | "wrong-token" | "token-length"
  | "invalid-cookies" | "too-many-cookies" | "invalid-cookie";

type ImportRefusal = { ok: false; reason: RefusalReason; received: number; accepted: 0 };
export type ImportMessageCheck = { ok: true; cookies: ImportCookie[]; skipped: number } | ImportRefusal;

function refuse(reason: RefusalReason, received = 0): ImportRefusal {
  return { ok: false, reason, received, accepted: 0 };
}

function isRecord(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ownValue(record: object, key: PropertyKey): unknown {
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

function hostname(domain: string): string | undefined {
  const host = domain.replace(/\.$/, "");
  if (host.length <= 253 && host.split(".").every((label) => HOST_LABEL.test(label))) {
    return host.toLowerCase();
  }
}

/** Check decoded companion IPC data. Only successful results carry cookie values. */
export function checkImportMessage(
  message: unknown,
  { remoteAddress, expectedToken, sites }: { remoteAddress: string | undefined; expectedToken: string; sites: readonly string[] },
): ImportMessageCheck {
  if (!LOOPBACK_ADDRESSES.includes(remoteAddress ?? "")) return refuse("not-loopback");
  if (!isRecord(message)) return refuse("invalid-message");

  const token = ownValue(message, "token");
  if (typeof token !== "string" || typeof expectedToken !== "string" || expectedToken.length === 0) {
    return refuse("wrong-token");
  }
  // UTF-16LE preserves the exact code units, and equal string lengths give equal buffer lengths.
  if (token.length !== expectedToken.length) return refuse("token-length");
  if (!timingSafeEqual(Buffer.from(token, "utf16le"), Buffer.from(expectedToken, "utf16le"))) {
    return refuse("wrong-token");
  }

  const cookies = ownValue(message, "cookies");
  if (!Array.isArray(cookies)) return refuse("invalid-cookies");
  if (cookies.length > MAX_IMPORT_COOKIES) return refuse("too-many-cookies", cookies.length);

  const chosenHosts = sites.map(hostname).filter((host) => host !== undefined);
  const accepted: ImportCookie[] = [];
  for (let index = 0; index < cookies.length; index++) {
    const cookie = ownValue(cookies, index);
    if (!isRecord(cookie)) return refuse("invalid-cookie", cookies.length);

    const domain = ownValue(cookie, "domain");
    const name = ownValue(cookie, "name");
    const value = ownValue(cookie, "value");
    if (typeof domain !== "string" || typeof name !== "string" || typeof value !== "string") {
      return refuse("invalid-cookie", cookies.length);
    }
    const host = hostname(domain.replace(/^\./, ""));
    if (!host) return refuse("invalid-cookie", cookies.length);
    if (!chosenHosts.some((site) => host === site || host.endsWith(`.${site}`))) continue;

    const checked: ImportCookie = { domain, name, value };
    for (const key of CHROME_COOKIE_METADATA) {
      const metadata = ownValue(cookie, key);
      if (metadata !== undefined) checked[key] = metadata;
    }
    accepted.push(checked);
  }

  return { ok: true, cookies: accepted, skipped: cookies.length - accepted.length };
}
