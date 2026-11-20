export type HandoffPromptTool = "open_thread" | "spawn_subagent";

export type HandoffPromptResult =
  | { ok: true; prompt: string; hidden: number; cut: false }
  | { ok: false; reason: string };

export const DEFAULT_HANDOFF_PROMPT_LIMIT = 8_000;

const MASK = "••••";
const INVISIBLE = /(?![\n\t])[\p{Cc}\p{Default_Ignorable_Code_Point}]/gu;
const SECRET_NAME = String.raw`(?:[a-z\d]+[_-])*(?:password|token|(?:api|access)[_-]?key)`;
const ASSIGNMENT_START = String.raw`(?<![\p{ID_Continue}$-])(?<name>${SECRET_NAME})["']?[ \t]*=(?![=>])[ \t]*`;
const QUOTED_VALUE = /(?<quote>["'`])(?<quotedValue>(?:\\[\s\S]|(?!\k<quote>)[^\\])*)(?:(?<closeQuote>\k<quote>)|\\?$)/;

// Match these together so the outermost secret wins, even if it contains another supported shape.
const COMPOUND_SECRET = new RegExp([
  /-----BEGIN (?<keyType>[A-Z ]*)PRIVATE KEY-----[\s\S]*?(?:-----END \k<keyType>PRIVATE KEY-----|$)/.source,
  String.raw`(?<=[?&])(?<=\bhttps?:\/\/[^\s<>"'\x60]*[?&])(?<queryName>${SECRET_NAME})=(?![=>])(?<queryValue>[^&#\s"'\x60<>]+)`,
  String.raw`(?<label>${ASSIGNMENT_START})(?:${QUOTED_VALUE.source}|(?<value>[^\s"'\x60]\S*))`,
  /(?<vaultQuote>["'`])op:\/\/(?:[^/\n"'`]+\/){2}[^\n"'`]+\k<vaultQuote>/.source,
  /\bop:\/\/(?:[^/\s<>"'`()\[\]{},;]+(?:[ \t]+[^/\s<>"'`()\[\]{},;]+)*\/){2}[^\s<>"'`()\[\]{},;]+/.source,
].join("|"), "giu");

// Match the whole credential, including its provider prefix.
const TOKEN_PATTERNS = [
  /(?<![A-Za-z0-9])(?:sk-(?:ant-(?:api|admin)\d{2}-)?|glpat-|gh[pousr]_)[A-Za-z0-9_-]{20,}/g,
  /(?<![A-Za-z0-9])(?:xox[abposr]-|(?:sk|rk)_(?:live|test)_|whsec_)[A-Za-z0-9_-]{10,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\b(?:AIza[A-Za-z0-9_-]{35}|re_[A-Za-z0-9_]{24,})/g,
  /\b(?:eyJ[A-Za-z0-9_-]+|SG)\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bbearer[ \t]+[A-Za-z0-9._~+/=-]{16,}/gi,
];
const LONG_TOKEN = /(\bhttps?:\/\/[^\s<>"'`]+)|[A-Za-z0-9_+/-]{32,}(?:={1,2}(?![A-Za-z0-9_+/-]))?/gi;
const HEX = /^[a-f\d]+$/i;
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const FILE_EXTENSION = /^\.[a-z][a-z\d]{0,9}(?![\w-])/i;
const SEPARATED_IDENTIFIER = /^(?:[a-z]{2,}\d*|[a-z]?\d+)(?:[-_](?:[a-z]{2,}\d*|[a-z]?\d+))+$/i;
const CASED_IDENTIFIER = /^(?:[a-z][a-z\d]*)?(?:[A-Z][a-z]*\d*)+$/;
const SHORT_CASE_GROUP = /\d[A-Z][a-z](?=[A-Z\d]|$)/g;

function isLongSecret(value: string, offset: number, text: string): boolean {
  const token = value.replace(/=+$/, "");
  if (UUID.test(token)) return false;
  // Bare 40-character hex also identifies Git commits. Explicit credential assignments are handled first.
  if (HEX.test(token)) return token.length === 32 || token.length === 64;

  const hasSlash = token.includes("/");
  const hasBase64Markers = token.includes("+") || value.length !== token.length;
  if (hasBase64Markers && value.length % 4 === 0 && BASE64.test(value)) return true;
  if (hasSlash) {
    const hasPathSyntax = FILE_EXTENSION.test(text.slice(offset + value.length))
      || (token.startsWith("/") && text[offset - 1] === ".");
    return token.length === 40 && !hasPathSyntax && BASE64.test(token);
  }

  if (!/[a-z]/i.test(token) || !/\d/.test(token) || SEPARATED_IDENTIFIER.test(token)) return false;
  const looksLikeCode = /[A-Z][a-z]{2,}/.test(token) && CASED_IDENTIFIER.test(token);
  // Repeated short letter/digit groups can still satisfy the casing rule.
  return !looksLikeCode || (token.match(SHORT_CASE_GROUP)?.length ?? 0) > 1;
}

function exceedsLimit(text: string, limit: number): boolean {
  let count = 0;
  for (const _codePoint of text) {
    if (++count > limit) return true;
  }
  return false;
}

/** Prepare the first instruction for a thread or sub-agent. An oversized prompt is refused whole. */
export function cleanHandoffPrompt(
  raw: unknown,
  tool: HandoffPromptTool,
  limit = DEFAULT_HANDOFF_PROMPT_LIMIT,
): HandoffPromptResult {
  const action = tool === "open_thread" ? "open a thread" : "start a sub-agent";
  if (typeof raw !== "string") return { ok: false, reason: `Use text for the prompt to ${action}.` };

  let prompt = raw.replace(INVISIBLE, "").trim();
  if (!prompt) return { ok: false, reason: `Provide a prompt to ${action}.` };
  if (!Number.isSafeInteger(limit) || limit < 0) {
    return { ok: false, reason: "The prompt limit must be a whole number of zero or more." };
  }

  const tooLong = { ok: false, reason: `The prompt is too long to ${action}. The limit is ${limit} code points.` } as const;
  if (exceedsLimit(prompt, limit)) return tooLong;

  let hidden = 0;
  const mask = () => {
    hidden++;
    return MASK;
  };

  prompt = prompt.replace(COMPOUND_SECRET, (match, ...captures: unknown[]) => {
    const { label, name, quote, quotedValue, closeQuote, value, queryName, queryValue, vaultQuote } =
      captures.at(-1) as Record<string, string | undefined>;
    if (queryName) {
      const isLimit = queryName.toLowerCase() === "max_token" && /^\d+$/.test(queryValue ?? "");
      return queryValue === MASK || isLimit ? match : `${queryName}=${mask()}`;
    }
    if (label) {
      if (quote) return quotedValue === MASK ? match : `${label}${quote}${mask()}${closeQuote ?? ""}`;
      // max_token is a numeric limit when assigned an integer.
      if (value === MASK || (name?.toLowerCase() === "max_token" && /^\d+[;,)}\]]*$/.test(value ?? ""))) return match;
      return label + mask();
    }
    return vaultQuote ? `${vaultQuote}${mask()}${vaultQuote}` : mask();
  });
  for (const pattern of TOKEN_PATTERNS) prompt = prompt.replace(pattern, mask);
  prompt = prompt.replace(LONG_TOKEN, (value, url: string | undefined, offset: number, text: string) => {
    return !url && isLongSecret(value, offset, text) ? mask() : value;
  });

  if (exceedsLimit(prompt, limit)) return tooLong;
  return { ok: true, prompt, hidden, cut: false };
}
