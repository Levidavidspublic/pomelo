import { readThreadLink, type ThreadLinkTarget } from "./thread-link.js";

type LinkDisplay = { href: string; host: string; text: string; mismatch: boolean };
type ReplyLink =
  | (LinkDisplay & { mode: "link"; target: "_blank"; rel: "noopener noreferrer" })
  | (LinkDisplay & { mode: "inApp"; thread: ThreadLinkTarget })
  | { mode: "text"; text: string; reason: string };

const BARE_HOSTNAME = /^(?:(?:[a-z\d-]+\.)+[a-z\d-]+\.?|\[[\da-f:.]+\])$/i;

function parseUrl(address: string, base?: string): URL | undefined {
  try {
    return new URL(address, base);
  } catch {
    return undefined;
  }
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:";
}

function labelHost(text: string, protocol: string): string | undefined {
  const label = text.trim();
  if (/^https?:/i.test(label)) return parseUrl(label)?.host;
  if (label.startsWith("//")) return parseUrl(`${protocol}${label}`)?.host;
  if (!label || /\s/.test(label)) return undefined;

  // Bare labels need a domain or IP to distinguish them from ordinary words.
  const url = parseUrl(`${protocol}//${label}`);
  if (url && !url.username && !url.password && BARE_HOSTNAME.test(url.hostname)) return url.host;
  return undefined;
}

export function replyLink({ href, text, appOrigin }: { href: string; text: string; appOrigin: string }): ReplyLink {
  const displayText = text.replace(/\p{Bidi_Control}/gu, "");
  const address = href.trim();
  const appUrl = parseUrl(appOrigin);
  const origin = appUrl && isHttpUrl(appUrl) ? appUrl.origin : undefined;
  const isFragment = address.startsWith("#");
  const url = parseUrl(address, isFragment ? origin : undefined);

  if (!url) return { mode: "text", text: displayText, reason: "The address is missing or invalid." };
  if (!isHttpUrl(url)) return { mode: "text", text: displayText, reason: "Only HTTP and HTTPS addresses can be opened." };
  if (url.username || url.password) {
    return { mode: "text", text: displayText, reason: "The address contains a username or password." };
  }

  const claimedHost = labelHost(displayText, url.protocol);
  const display = {
    href: url.href,
    host: url.host,
    text: displayText,
    mismatch: claimedHost !== undefined && claimedHost !== url.host,
  };
  if (url.origin === origin) {
    const thread = readThreadLink(url.hash);
    if (thread.ok) return { mode: "inApp", ...display, thread: thread.target };
  }
  if (isFragment) return { mode: "text", text: displayText, reason: "The thread address is invalid." };

  return { mode: "link", ...display, target: "_blank", rel: "noopener noreferrer" };
}
