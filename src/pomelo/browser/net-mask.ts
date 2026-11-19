import { hideSecrets } from "../../secrets.js";

export const NET_MASK = "••••";

type Headers = Readonly<Record<string, string>>;

export interface RequestRecord {
  method: string;
  url: string;
  headers: Headers;
  postData?: string | null;
}

export interface MaskedRequestRecord extends Omit<RequestRecord, "postData"> {
  bodyBytes: number;
}

export interface ResponseRecord {
  status: number;
  url: string;
  headers: Headers;
}

const SENSITIVE_HEADER = /^(?:cookie|set-cookie|authorization|proxy-authorization)$|token|secret|api-key|apikey|session/i;
const SENSITIVE_PARAMETER = /^(?:token|access_token|id_token|code|key|api_key|password|secret|sig|signature|session)$/i;

function maskHeaders(headers: Headers): Headers {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name, SENSITIVE_HEADER.test(name) ? NET_MASK : value,
  ]));
}

function maskParameters(raw: string): string {
  return raw.split("&").map((part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return part;
    const name = part.slice(0, separator);
    const decodedName = new URLSearchParams("?" + name + "=").keys().next().value;
    return decodedName !== undefined && SENSITIVE_PARAMETER.test(decodedName) ? name + "=" + NET_MASK : part;
  }).join("&");
}

function maskUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "[unreadable address]";
  }
  url.username = "";
  url.password = "";
  const query = url.search.slice(1);
  const maskedQuery = maskParameters(query);
  if (query !== maskedQuery) url.search = "?" + maskedQuery;
  const fragment = url.hash.slice(1);
  // A fragment can have a route before its parameters. A question mark inside a value stays part of that value.
  const prefix = fragment.match(/^[^?=&]*\?/)?.[0] ?? "";
  const parameters = fragment.slice(prefix.length);
  const maskedFragment = maskParameters(parameters);
  if (parameters !== maskedFragment) url.hash = "#" + prefix + maskedFragment;
  return url.href;
}

function bodyByteLength(body: string): number {
  let bytes = 0;
  for (const character of body) {
    // String iteration groups surrogate pairs. A lone surrogate takes three bytes as the UTF-8 replacement character.
    const codeUnit = character.charCodeAt(0);
    if (character.length === 2) bytes += 4;
    else if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else bytes += 3;
  }
  return bytes;
}

export function maskRequest({ method, url, headers, postData }: RequestRecord): MaskedRequestRecord {
  return { method, url: maskUrl(url), headers: maskHeaders(headers), bodyBytes: bodyByteLength(postData ?? "") };
}

export function maskResponse({ status, url, headers }: ResponseRecord): ResponseRecord {
  return { status, url: maskUrl(url), headers: maskHeaders(headers) };
}

const escapePattern = (value: string): string => value.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");

export function maskConsole(text: string, known: readonly string[]): string {
  const patterns = new Map<string, number>();
  for (const value of known) {
    if (value === "") continue;
    patterns.set(escapePattern(value), value.length);
    const wellFormed = value.replace(/[\uD800-\uDFFF]/gu, "\uFFFD");
    const formEncoded = new URLSearchParams({ value }).toString().slice("value=".length);
    for (const encoded of [encodeURIComponent(wellFormed), encodeURI(wellFormed), formEncoded]) {
      if (encoded === value) continue;
      // Percent escapes allow either case. Other characters still match literally.
      const pattern = escapePattern(encoded).replace(/%[0-9A-F]{2}/g, (escape) =>
        escape.replace(/[A-F]/g, (digit) => "[" + digit + digit.toLowerCase() + "]"),
      );
      patterns.set(pattern, encoded.length);
    }
  }
  if (patterns.size === 0) return hideSecrets(text).text;

  // Prefer the longest match at each position, then check for matches that overlap it.
  const alternatives = [...patterns].sort((a, b) => b[1] - a[1]).map(([pattern]) => pattern);
  const secrets = new RegExp(alternatives.join("|"), "g");
  let masked = "";
  let maskedThrough = 0;
  for (let match = secrets.exec(text); match; match = secrets.exec(text)) {
    if (match.index >= maskedThrough) masked += text.slice(maskedThrough, match.index) + NET_MASK;
    maskedThrough = Math.max(maskedThrough, secrets.lastIndex);
    secrets.lastIndex = match.index + 1;
  }
  return hideSecrets(masked + text.slice(maskedThrough)).text;
}
