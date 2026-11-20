import { HIDDEN } from "../secrets.js";
import { MASK, maskText } from "./mask.js";

const FALLBACK = "Sub-agent task";
const LIMIT = 120;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

type PurposeReason = "controls" | "markup" | "secrets" | "whitespace" | "truncated" | "fallback";
type LanePurpose = { purpose: string; changed: boolean; reasons: PurposeReason[] };

// Keep line separators for Markdown, and keep joiners and tags for composed text and emoji.
const CONTROLS = /[\p{Cc}\p{Cf}]/gu;
const KEEP_CONTROL = /[\t-\r\u0085\u200c\u200d\u{e0020}-\u{e007f}]/u;
const QUOTED_VAULT = /(["'`])op:\/\/[^\r\n]*?\1/gi;
const VAULT_PATH = /\bop:\/\/[^\s<>"'`),;\]}]+/gi;
const CREDENTIAL = /((?<![\w.-])(?:[\w.-]*[_.-])?(?:(?:api|access|private|auth|client|service|refresh|session|id)[_.-]?)?(?:password|passwd|passphrase|token|secret|key)(?:[_.-][\w.-]+)?["']?\s*[:=]\s*)("(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*'|`[^`\r\n]*`|[^\s<>"'`,;)}\]&]+)/gi;
const INLINE_CODE = /(?<!`)(`+)([^`\r\n]+)\1(?!`)/g;

function stripMarkup(text: string): string {
  return text
    .replace(/<!--[\s\S]*?(?:-->|$)|<!doctype\s+[^>]*>|<\/?[a-z][\w:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, "")
    .replace(/[^\n\r\v\f\u0085\u2028\u2029]+/g, (line) => line
      .replace(/^\s*(?:>[ \t]*|(?:[-+*]|\d+[.)])[ \t]+)+/, "")
      .replace(/^\s*#{1,6}(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/, "$1")
      .replace(/^\s*(?:`{3,}|~{3,})(?:[\w-]+)?\s*$|^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, "")
      .replace(/!?\[([^\[\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
      .replace(/(\*{1,3}|~~)(?=\S)([^*~]*?\S)\1/g, "$2")
      .replace(/(?<![\p{L}\p{N}_])(_{1,3})(?=\S)([^_]*?\S)\1(?![\p{L}\p{N}_])/gu, "$2"));
}

function maskSecrets(text: string): string {
  const redacted = text
    .replace(QUOTED_VAULT, (_match, quote: string) => `${quote}${MASK}${quote}`)
    .replace(VAULT_PATH, MASK)
    .replace(CREDENTIAL, (_match, label: string, value: string) => {
      const quote = value[0];
      if (quote === '"' || quote === "'" || quote === "`") return `${label}${quote}${MASK}${quote}`;
      return label + MASK;
    });
  return maskText(redacted, [])
    .replaceAll(`-----BEGIN PRIVATE KEY----- ${HIDDEN} -----END PRIVATE KEY-----`, MASK)
    // Friday's shield retains the recognizable prefix. A lane label displays only the mask.
    .replace(/[\w./-]+…\[secret hidden\]/g, MASK)
    .replaceAll(HIDDEN, MASK);
}

/** Clean an agent-supplied lane label before storage. Reasons are fixed labels without input text. */
export function cleanLanePurpose(raw: unknown): LanePurpose {
  const reasons: PurposeReason[] = [];
  if (typeof raw !== "string") return { purpose: FALLBACK, changed: true, reasons: ["fallback"] };

  try {
    const printable = raw.replace(CONTROLS, (character) => KEEP_CONTROL.test(character) ? character : "");
    if (printable !== raw) reasons.push("controls");

    const unmarked = stripMarkup(printable);
    // Mask code spans while their delimiters still bound quoted credentials and vault paths.
    const masked = maskSecrets(unmarked);
    const decoded = masked.replace(INLINE_CODE, "$2");
    const safe = decoded === masked ? masked : maskSecrets(decoded);
    if (unmarked !== printable || decoded !== masked) reasons.push("markup");
    if (masked !== unmarked || safe !== decoded) reasons.push("secrets");

    const line = safe.replace(/[\s\u0085]+/g, " ").trim();
    if (line !== safe) reasons.push("whitespace");
    if (!line) return { purpose: FALLBACK, changed: true, reasons: [...reasons, "fallback"] };

    let count = 0;
    for (const { index } of graphemes.segment(line)) {
      if (count === LIMIT) {
        return { purpose: line.slice(0, index).trimEnd(), changed: true, reasons: [...reasons, "truncated"] };
      }
      count++;
    }
    return { purpose: line, changed: line !== raw, reasons };
  } catch {
    return { purpose: FALLBACK, changed: true, reasons: ["fallback"] };
  }
}
