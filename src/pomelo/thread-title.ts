export interface ThreadTitleOptions {
  fallback?: string;
}

export type ThreadTitleReason =
  | "non-string"
  | "control-characters"
  | "whitespace"
  | "markdown"
  | "secret"
  | "truncated"
  | "empty";

export interface ThreadTitleResult {
  title: string;
  changed: boolean;
  reasons: ThreadTitleReason[];
}

const DEFAULT_TITLE = "New thread";
const MAX_GRAPHEMES = 80;
const HIDDEN = "[hidden]";
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Keep whitespace controls until whitespace folding. Joiners and combining marks stay intact.
const CONTROLS = /(?!\s|\u0085)[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;
const WHITESPACE = /[\s\u0085]+/g;
const LEADING_MARKUP = /^(?:[ *_]+|#{1,6}(?= |$))+/;
const TRAILING_MARKUP = /(?<![ *_])[ *_]+(?:(?<= )#{1,6}[ *_]*)?$/;

// Match Friday's credential shapes locally so the title rule can hide the entire token.
// Allow an adjacent underscore because an agent may wrap a token in Markdown emphasis.
const SECRET_PATTERNS = [
  /-----BEGIN ([A-Z ]*)PRIVATE KEY-----[\s\S]*?(?:-----END \1PRIVATE KEY-----|$)/g,
  /"op:\/\/[^"]+"|'op:\/\/[^']+'/gi,
  /(?<![A-Za-z0-9])op:\/\/(?:[^\s/"'<>()\[\]{},;]+(?: [^\s/"'<>()\[\]{},;]+)*\/)*[^\s"'<>()\[\]{},;]+/gi,
  /(?<![A-Za-z0-9])Bearer +[A-Za-z0-9._~+/=-]+/gi,
  /(?:https?:\/\/)?hooks\.[a-z0-9.-]+\/services\/[A-Za-z0-9/_-]{20,}/g,
  /(?:https?:\/\/)?discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]{30,}/g,
  /(?<![A-Za-z0-9])(?:sk-|gh[pousr]_)[A-Za-z0-9_-]+/g,
  /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{40,}/g,
  /(?<![A-Za-z0-9])glpat-[A-Za-z0-9_-]{20,}/g,
  /(?<![A-Za-z0-9])xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /(?<![A-Za-z0-9])(?:(?:sk|rk)_(?:live|test)_|whsec_)[A-Za-z0-9]{16,}/g,
  /(?<![A-Za-z0-9])AIza[A-Za-z0-9_-]{35,}/g,
  /(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])(?:phx_|hf_)[A-Za-z0-9]{30,}/g,
  /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])(?:gsk_|xai-)[A-Za-z0-9]{40,}/g,
  /(?<![A-Za-z0-9])re_[A-Za-z0-9_]{24,}/g,
  /(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
  /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /(?<![A-Za-z0-9])fw_[a-z]{2,8}_[A-Za-z0-9_-]{30,}/g,
];
const URL_PASSWORD = /(?<![A-Za-z0-9])((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|https?|ftp):\/\/[^:\s/@]+:)[^@\s/]+@/g;
const ASSIGNED_SECRET = /((?:^|[\s"'*{,(])["']?[A-Za-z0-9_.-]*(?:secret|token|password|passwd|passphrase|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?key|credentials?)[A-Za-z0-9_.-]*["']? *([:=]) *)(?:"[^"]+"|'[^']+'|([^\s"'\x60,;)}\]]+))/gi;
const SECRET_REFERENCE = /^(?:process\.env|os\.environ|import\.meta|env\.|config\.|settings\.|secrets\.|\$\{|\$[A-Z_]|<|\(|\[|[A-Za-z_$][\w$]*\(|[A-Za-z_$][\w$]*(?:\.[\w$]+)+$)/;
const LONG_CREDENTIAL = /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{32,}={0,2}/g;

function hideCredentials(title: string): string {
  for (const pattern of SECRET_PATTERNS) title = title.replace(pattern, HIDDEN);
  title = title.replace(URL_PASSWORD, "$1" + HIDDEN + "@");
  title = title.replace(ASSIGNED_SECRET, (match, label: string, separator: string, unquoted?: string) => {
    if (unquoted && SECRET_REFERENCE.test(unquoted)) return match;
    if (unquoted && separator === ":" && (unquoted.length < 8 || /^[A-Za-z_$]+$/.test(unquoted))) return match;
    return label + HIDDEN;
  });
  return title.replace(LONG_CREDENTIAL, (run) => {
    if (/^_*[A-Fa-f0-9]{32,}_*$/.test(run)) return HIDDEN;
    // Base64 and ordinary words share an alphabet. Look for digits, symbols, or mixed case.
    if (/[\d+/=]/.test(run) || (/[a-z]/.test(run) && /[A-Z]/.test(run))) return HIDDEN;
    return run;
  });
}

function clipTitle(title: string): string {
  let count = 0;
  let ellipsisIndex = 0;
  for (const { index } of GRAPHEMES.segment(title)) {
    if (count === MAX_GRAPHEMES - 1) ellipsisIndex = index;
    if (count === MAX_GRAPHEMES) return title.slice(0, ellipsisIndex) + "…";
    count++;
  }
  return title;
}

function cleanTitle(raw: string, reasons: Set<ThreadTitleReason>): string {
  let title = raw;
  const apply = (next: string, reason: ThreadTitleReason) => {
    if (next !== title) reasons.add(reason);
    title = next;
  };

  apply(title.replace(CONTROLS, ""), "control-characters");
  apply(title.replace(WHITESPACE, " ").trim(), "whitespace");
  apply(hideCredentials(title), "secret");
  apply(title.replace(LEADING_MARKUP, "").replace(TRAILING_MARKUP, ""), "markdown");
  apply(clipTitle(title), "truncated");
  return title;
}

/** Clean an agent-provided thread title and report changes using fixed reason codes. */
export function cleanThreadTitle(raw: unknown, opts?: ThreadTitleOptions): ThreadTitleResult {
  const reasons = new Set<ThreadTitleReason>();
  let title = "";
  if (typeof raw === "string") {
    title = cleanTitle(raw, reasons);
    if (!title) reasons.add("empty");
  } else {
    reasons.add("non-string");
  }

  if (!title) {
    const fallback = opts?.fallback;
    title = (typeof fallback === "string" && cleanTitle(fallback, reasons)) || DEFAULT_TITLE;
  }
  return { title, changed: title !== raw, reasons: [...reasons] };
}
