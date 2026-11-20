type MaskedPageRead = {
  url: string;
  title: string;
  text: string;
  status?: number;
};

type BotWallHistory = {
  waitsSoFar: number;
  reloadsSoFar: number;
};

type BotWallKind = "blocked" | "checking" | "rate-page";

type BotWallResult =
  | { verdict: "go-on"; reason: string; kind?: never; card?: never }
  | { verdict: "wait"; kind: "checking"; reason: string; card?: never }
  | { verdict: "hold"; kind: BotWallKind; reason: string; card: { title: string; body: string } };

const BLOCKED = /\b(?:access denied|you have been blocked|unusual traffic from your network|request blocked)\b|(?:^|\P{L})הגישה (?:נחסמה|נדחתה)(?!\p{L})/u;
const CHECKING = /\b(?:checking your browser|verifying (?:that )?you are human)\b|^just a moment\b/;
const RATE_HEADING = /^\s*(?:(?:http\s+|error\s+)?429[\s:–-]+)?too\s+many\s+requests(?=\s*(?:[.!,:–-]|$))/im;
const PUZZLE = /\b(?:captcha|recaptcha|hcaptcha|turnstile|(?:solve|complete) (?:a|the) puzzle|check the box|select all images|i(?: am|['’]m) not a robot)\b/;
const MANUAL_CHECK = /^\s*(?:please\s+)?verify(?:\s+that)?\s+you\s+are\s+human\b/im;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectWall({ title, text, status }: MaskedPageRead): BotWallKind | undefined {
  if (status === 429) return "rate-page";
  if ((status === 403 || status === 451) && text.length < 600) return "blocked";

  // Long reads can quote wall messages as part of ordinary content.
  if (text.length > 3_000) return undefined;

  if (RATE_HEADING.test(title) || RATE_HEADING.test(text)) return "rate-page";
  const page = [normalize(title), normalize(text)];
  if (page.some((part) => BLOCKED.test(part))) return "blocked";
  if (!page.some((part) => CHECKING.test(part))) return undefined;
  if (page.some((part) => PUZZLE.test(part)) || MANUAL_CHECK.test(text)) return undefined;
  return "checking";
}

function hold(kind: BotWallKind, reason: string, url: string): BotWallResult {
  const address = URL.parse(url);
  const host = address?.protocol === "https:" || address?.protocol === "http:" ? address.hostname : "";
  const site = host || "The site";
  return {
    verdict: "hold",
    kind,
    reason,
    card: {
      title: "Browser job on hold",
      body: `${site} blocked the automated browser. Amit can open the page himself or cancel the job.`,
    },
  };
}

/** Decide whether an already-masked read can proceed, without acting on the page. */
export function checkBotWall(read: MaskedPageRead, history: BotWallHistory): BotWallResult {
  const kind = detectWall(read);
  switch (kind) {
    case "rate-page":
      return hold(kind, "The site is limiting requests. See the pace rule.", read.url);
    case "blocked":
      return hold(kind, "The site denied access to the automated browser.", read.url);
    case "checking":
      if (history.reloadsSoFar >= 2) return hold(kind, "The browser check is still showing after two reloads.", read.url);
      if (history.waitsSoFar >= 2) return hold(kind, "The browser check did not clear after two waits.", read.url);
      return { verdict: "wait", kind, reason: "Wait briefly for the site's browser check to clear." };
    default:
      return { verdict: "go-on", reason: "No bot wall detected." };
  }
}
