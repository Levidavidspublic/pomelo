export type PageScriptDecision = "allow" | "hold" | "refuse";

const REFUSAL_RULES = [
  ["cookies", /\b(?:cookie|cookieStore)\b/u],
  ["storage", /\b(?:localStorage|sessionStorage|indexedDB)\b/u],
  ["field-value",
    /\.\s*value\b|\[\s*["'`]value["'`]\s*\]|\bFormData\b/u,
    // A bare or quoted property name can read a field through destructuring.
    /[{,]\s*(?:value|(["'])value\1)\s*(?=[:=,}])/u,
  ],
  ["network",
    /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/u,
    /(?:\.\s*(?:src|href)\b|\blocation\b|\[\s*["'`](?:src|href|location)["'`]\s*\])\s*(?:=(?!=|>)|(?:[-+*/%&|^]|\*\*|&&|\|\||\?\?|<<|>>>?)=|\+\+|--)/u,
    /\bsetAttribute\s*\(\s*["'`](?:src|href)["'`]\s*,|\blocation\s*\.\s*(?:assign|replace)\s*\(/u,
  ],
  ["dynamic-code",
    /\beval\b|\bnew\s+Function\b|\bFunction\s*\(/u,
    /(?:\bsetTimeout\b|\[\s*["'`]setTimeout["'`]\s*\])\s*(?:\?\.\s*)?\(\s*(?:\(\s*)*["'`]/u,
  ],
  ["clipboard", /\b(?:clipboard|clipboardData|ClipboardItem)\b|\bexecCommand\s*\(\s*["'`](?:copy|cut|paste)["'`]/iu],
] as const;

export type PageScriptReason =
  | (typeof REFUSAL_RULES)[number][0]
  | "empty"
  | "not-text"
  | "computed-key"
  | "identifier-escape"
  | "too-long"
  | "unclear-syntax";

export interface PageScriptResult {
  decision: PageScriptDecision;
  reasons: PageScriptReason[];
}

export const MAX_PAGE_SCRIPT_LENGTH = 2000;

const NON_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|\p{Cs}/u;
const COMPUTED_KEY = /\b(?:document|window|globalThis|navigator)\s*(?:\)\s*)*(?:\?\.\s*)?\[(?!\s*(?:""|\d+)\s*\])/u;
const IDENTIFIER_ESCAPE = /\\[ux]/u;

// Refusal patterns also see literal text. Review patterns only see code and key shapes.
function stripComments(script: string): { source: string; code: string; unclear: boolean } {
  const codeToken = /(?<comment>\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?(?:\*\/|$)|^#![^\r\n\u2028\u2029]*)|(?<quoted>"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*')|["'`{}]|\/(?=[^/\r\n\u2028\u2029]*\/)/gu;
  const templateToken = /\\[\s\S]|`|\$\{/gu;
  const interpolationDepths: number[] = [];
  let inTemplate = false;
  let unclear = false;
  let offset = 0;
  let source = "";
  let code = "";

  while (offset < script.length) {
    const tokens = inTemplate ? templateToken : codeToken;
    tokens.lastIndex = offset;
    const match = tokens.exec(script);
    const chunk = script.slice(offset, match?.index);
    source += chunk;
    if (!inTemplate) code += chunk;
    if (!match) break;

    const [token] = match;
    offset = tokens.lastIndex;
    if (match.groups?.comment) {
      // Preserve separation between tokens on either side of the comment.
      const separator = /[\r\n\u2028\u2029]/u.test(token) ? "\n" : " ";
      source += separator;
      code += separator;
      if (token.startsWith("/*") && (token.length < 4 || !token.endsWith("*/"))) unclear = true;
      continue;
    }

    source += token;
    if (inTemplate) {
      if (token === "`") inTemplate = false;
      else if (token === "${") {
        interpolationDepths.push(1);
        inTemplate = false;
        code += " {";
      } else if (IDENTIFIER_ESCAPE.test(token)) {
        // An escaped template key needs review just like an escaped quoted key.
        code += " escaped";
      }
    } else if (match.groups?.quoted) {
      // A plain literal bracket key is static. Review escaped keys without decoding them.
      code += IDENTIFIER_ESCAPE.test(token) ? '"escaped"' : '""';
    } else if (token === "`") {
      code += '""';
      inTemplate = true;
    } else {
      code += token;
      const depth = interpolationDepths.length - 1;
      if (depth >= 0 && token === "{") interpolationDepths[depth]++;
      if (depth >= 0 && token === "}") {
        interpolationDepths[depth]--;
        if (interpolationDepths[depth] === 0) {
          interpolationDepths.pop();
          inTemplate = true;
        }
      }
      // A slash with a possible closing delimiter can begin a regular expression.
      if (token === "/" || token === '"' || token === "'") unclear = true;
    }
  }

  return { source, code, unclear: unclear || inTemplate || interpolationDepths.length > 0 };
}

/** Classify script text before page execution, returning only fixed reason codes. */
export function checkPageScript(script: unknown): PageScriptResult {
  if (typeof script !== "string") return { decision: "hold", reasons: ["not-text"] };
  if (!script.trim()) return { decision: "refuse", reasons: ["empty"] };

  const { source, code, unclear } = stripComments(script);
  const reasons: PageScriptReason[] = [];
  for (const [reason, ...patterns] of REFUSAL_RULES) {
    if (patterns.some((pattern) => pattern.test(source))) reasons.push(reason);
  }
  const refused = reasons.length > 0;

  if (COMPUTED_KEY.test(code)) reasons.push("computed-key");
  if (IDENTIFIER_ESCAPE.test(code)) reasons.push("identifier-escape");
  if (script.length > MAX_PAGE_SCRIPT_LENGTH) reasons.push("too-long");
  if (NON_TEXT.test(script)) reasons.push("not-text");
  if (unclear) reasons.push("unclear-syntax");

  if (refused) return { decision: "refuse", reasons };
  return { decision: reasons.length > 0 ? "hold" : "allow", reasons };
}
