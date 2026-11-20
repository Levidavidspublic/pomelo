export type HandoffPromptTool = "open_thread" | "spawn_subagent";

export type HandoffPromptResult =
  | { ok: true; prompt: string; hidden: number; cut: false }
  | { ok: false; reason: string };

export const DEFAULT_HANDOFF_PROMPT_LIMIT = 8_000;

const MASK = "••••";
const INVISIBLE = /(?![\n\t])[\p{Cc}\p{Default_Ignorable_Code_Point}]/gu;

// Match these together so the outermost secret wins, even if it contains another supported shape.
const COMPOUND_SECRET = new RegExp([
  /-----BEGIN (?<keyType>[A-Z ]*)PRIVATE KEY-----[\s\S]*?(?:-----END \k<keyType>PRIVATE KEY-----|$)/.source,
  /((?<![\w-])(?:[\w-]+[_-])?(?:password|token)["']?[ \t]*=[ \t]*)("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[^\s"'`,;)}\]&]+)/.source,
  /(?<vaultQuote>["'`])op:\/\/(?:[^/\n"'`]+\/){2}[^\n"'`]+\k<vaultQuote>/.source,
  /\bop:\/\/(?:[^/\s<>"'`()\[\]{},;]+\/){2}[^\s<>"'`()\[\]{},;]+/.source,
].join("|"), "gi");

// Match the whole credential, including its provider prefix.
const TOKEN_PATTERNS = [
  /(?<![A-Za-z0-9])(?:sk-(?:ant-(?:api|admin)\d{2}-)?|glpat-|gh[pousr]_)[A-Za-z0-9_-]{20,}/g,
  /(?<![A-Za-z0-9])(?:xox[abposr]-|(?:sk|rk)_(?:live|test)_|whsec_)[A-Za-z0-9_-]{10,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\b(?:AIza[A-Za-z0-9_-]{35}|re_[A-Za-z0-9_]{24,})/g,
  /\b(?:eyJ[A-Za-z0-9_-]+|SG)\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bbearer[ \t]+[A-Za-z0-9._~+/=-]{16,}/gi,
];
const LONG_TOKEN = /[A-Za-z0-9_+/-]{32,}={0,2}/g;

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

  prompt = prompt.replace(COMPOUND_SECRET,
    (match, _keyType: string | undefined, label?: string, value?: string, vaultQuote?: string) => {
      if (label && value) {
        const quote = value[0];
        if (quote === '"' || quote === "'" || quote === "`") {
          return value.slice(1, -1) === MASK ? match : `${label}${quote}${mask()}${quote}`;
        }
        return value === MASK ? match : label + mask();
      }
      return vaultQuote ? `${vaultQuote}${mask()}${vaultQuote}` : mask();
    });
  for (const pattern of TOKEN_PATTERNS) prompt = prompt.replace(pattern, mask);
  prompt = prompt.replace(LONG_TOKEN, (value) => {
    const mixedCase = /[a-z]/.test(value) && /[A-Z]/.test(value);
    const lettersAndDigits = /[a-z]/i.test(value) && /\d/.test(value);
    // A slash alone can be part of a file path. Require stronger evidence of a base64 token.
    const looksLikeToken = /^[a-f\d]{32,}$/i.test(value) || /[+=]/.test(value) ||
      (value.includes("/") ? mixedCase && lettersAndDigits : mixedCase || lettersAndDigits);
    return looksLikeToken ? mask() : value;
  });

  if (exceedsLimit(prompt, limit)) return tooLong;
  return { ok: true, prompt, hidden, cut: false };
}
