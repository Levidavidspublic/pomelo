export interface SiteDownFacts {
  status?: number | null;
  title?: string | null;
  maskedText?: string | null;
  retryAfterSeconds?: number | null;
  /** Includes the load being checked. The first failed load is try 1. */
  triesSoFar: number;
  lastStepKind?: string | null;
  maxTries?: number;
}

export interface SiteDownResult {
  verdict: "go" | "wait" | "hold";
  waitSeconds: number;
  reason: string;
}

const DEFAULT_MAX_TRIES = 3;
const FIRST_WAIT_SECONDS = 5;
const MAX_WAIT_SECONDS = 60;

const OUTAGE_HEADINGS = [
  /^(?:(?:http |error )?5\d\d[ :–—-]+)?(?:down for (?:scheduled )?maintenance|under (?:scheduled )?maintenance|(?:service )?temporarily unavailable|service unavailable|(?:internal )?server error|bad gateway|gateway time[- ]?out)(?=$|[.!…](?:$| please )| \| )/i,
  /^(?:(?:the|this|our) )?(?:site|website|server|service) (?:is )?(?:currently )?(?:down(?: for (?:scheduled )?maintenance)?|(?:under|undergoing) (?:scheduled )?maintenance|temporarily unavailable)(?=$|[.!…](?:$| )| \| )/i,
  /^(?:sorry, )?(?:we are|we['’]re) (?:currently )?(?:down for|undergoing|performing) (?:scheduled )?maintenance(?=$|[.!…](?:$| )| \| )/i,
  /^האתר (?:בתחזוקה|מושבת|אינו זמין(?: זמנית)?)(?=$|[.!…](?:$| )| \| )/u,
  /^(?:http|error) 5\d\d[.!]?$/i,
];
const NOT_FOUND_HEADING = /^(?:404 (?:error|(?:page )?not found)|page not found)[.!…]?(?: \| .+)?$/i;

function hold(reason: string): SiteDownResult {
  return { verdict: "hold", waitSeconds: 0, reason };
}

/** Classifies a masked page read. The caller owns the retry count and any later load. */
export function siteDownStop(facts: SiteDownFacts): SiteDownResult {
  const { status, title, maskedText, retryAfterSeconds, triesSoFar, lastStepKind, maxTries = DEFAULT_MAX_TRIES } = facts;

  if (status === 404) return hold("not-found");
  if (status != null && (!Number.isInteger(status) || status < 100 || status > 599)) {
    return hold("The load status is invalid. Amit can review the job.");
  }

  const text = typeof maskedText === "string" ? maskedText : "";
  // Outage wording normally appears as a title, heading, or opening sentence.
  const lines = [typeof title === "string" ? title : "", ...text.split(/\r?\n/)]
    .map((line) => line.trim().replace(/\s+/g, " "));
  const serverError = status != null && status >= 500;

  if (!serverError && (lines[0] === "404" || lines.some((line) => NOT_FOUND_HEADING.test(line)))) return hold("not-found");
  if (status != null && status >= 400 && !serverError) return hold("The page returned an HTTP error.");

  const outageHeading = lines.some((line) => OUTAGE_HEADINGS.some((pattern) => pattern.test(line)));
  if (!outageHeading && /^[\s•]*$/.test(text)) return hold("The page read is empty or unreadable.");
  if (!serverError && !outageHeading) return { verdict: "go", waitSeconds: 0, reason: "Page is readable." };

  if (!Number.isSafeInteger(triesSoFar) || triesSoFar < 0 || !Number.isSafeInteger(maxTries) || maxTries < 0) {
    return hold("The retry count is invalid. Amit can review the job.");
  }
  const currentTry = Math.max(1, triesSoFar);
  if (currentTry > maxTries) return hold("The site is still unavailable after the retry limit. Amit can review the job.");
  if (lastStepKind === "fill" || lastStepKind === "import") return hold("after-fill");

  const backoff = FIRST_WAIT_SECONDS * 2 ** (currentTry - 1);
  const delay = typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds
    : backoff;
  return { verdict: "wait", waitSeconds: Math.min(MAX_WAIT_SECONDS, delay), reason: "The site is temporarily unavailable." };
}
