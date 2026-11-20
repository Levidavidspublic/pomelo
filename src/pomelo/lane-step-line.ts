export const LANE_TOOL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  read_file: "Reading a file",
  read: "Reading a file",
  list_files: "Looking through the folder",
  search_code: "Searching the code",
  search: "Searching the code",
  edit_file: "Editing a file",
  edit: "Editing a file",
  write_file: "Writing a file",
  write: "Writing a file",
  run_command: "Running a command",
  shell: "Running a command",
  run_background: "Starting a background command",
  read_background: "Checking on a background command",
  stop_background: "Stopping a background command",
  web_search: "Searching the web",
  fetch_url: "Reading a web page",
  web_fetch: "Reading a web page",
  update_plan: "Updating its plan",
  todo: "Updating its plan",
  ask_human: "Asking a question",
  hand_off: "Handing work to another agent",
  deploy_agent: "Deploying a specialist",
  show_preview: "Starting a preview",
  remember: "Making a note",
  add_skills_from_github: "Adding skills",
  task: "Sending off a subagent",
  agent: "Sending off a subagent",
  spawn_agent: "Sending off a subagent",
  subagent: "Sending off a subagent",
});

const LIMIT = 60;
const MASK = "••••";
const CONTROLS = /((?<=\p{Extended_Pictographic}[\ufe0e\ufe0f\p{Emoji_Modifier}]*)\u200d(?=\p{Extended_Pictographic}))|[\p{Cc}\p{Cf}\p{Cs}]/gu;
const TOOL_NAME = /^[\p{L}\p{M}\p{N}_.-]+$/u;
const QUOTED_VAULT = /(["'`])op:\/\/[^\r\n]*?\1/gi;
const VAULT_PATH = /\bop:\/\/(?:[^\s/<>"'`),;\]}]+(?:[ \t]+[^\s/<>"'`),;\]}]+)*\/)*[^\s<>"'`),;\]}]+/gi;
const PREFIXED_SECRET = /(?<![A-Za-z0-9])(?:(?:sk-|[sr]k_(?:live|test)_|gh[pousr]_|github_pat_|xox[baprs]-)[\w-]{4,}|(?:AKIA|ASIA)[A-Z0-9]{16}\b|AIza[\w-]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g;
const CREDENTIAL_LABEL = /\bBearer\s+|\b(?:\w+[_.-])?(?:(?:api|access|auth|client|id|private|refresh|service|session)[ _.-]?)?(?:key|token|secret|password|passwd|passphrase|cookie)["']?\s*[:=]\s*/;
const BOUNDED_VALUE = /"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|`[^`\r\n]*`|\*\*[^*\r\n]+\*\*|__[^_\r\n]+__/;
const BARE_VALUE = /[^\s<>"'`*]+/;
const BOUNDED_CREDENTIAL = new RegExp(`(${CREDENTIAL_LABEL.source})(?:${BOUNDED_VALUE.source})`, "gi");
const CREDENTIAL = new RegExp(`(${CREDENTIAL_LABEL.source})(${BOUNDED_VALUE.source}|${BARE_VALUE.source})`, "gi");

function maskSecrets(text: string): string {
  return text
    .replace(/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g, MASK)
    .replace(/(\b(?:set-cookie|cookie)[ \t]*:[ \t]*)[^\r\n\u0085\u2028\u2029]+/gi, `$1${MASK}`)
    .replace(QUOTED_VAULT, MASK)
    .replace(VAULT_PATH, (path) => MASK + (path.match(/[.!?]+$/u)?.[0] ?? ""))
    .replace(CREDENTIAL, (_match, label: string, value: string) => label + MASK + (value.match(/[.!?]+$/u)?.[0] ?? ""))
    .replace(PREFIXED_SECRET, MASK);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^[ \t]*(?:`{3,}|~{3,})[^\r\n]*$/gm, "")
    .replace(/^[ \t]*(?:(?:[-+*]|\d+[.)]|#{1,6})[ \t]+|>[ \t]*)+/gm, "")
    .replace(/!?\[([^\[\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/(\*{1,3}|~~)(?=\S)([^*~]*?\S)\1/g, "$2")
    .replace(/(?<![\p{L}\p{N}_])(_{1,3})(?=\S)([^_]*?\S)\1(?![\p{L}\p{N}_])/gu, "$2");
}

function clip(line: string): string {
  if (line.length <= LIMIT) return line;

  // In the fallback, group combining marks with their base code point.
  const segments = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("en", { granularity: "grapheme" }).segment(line)
    : line.matchAll(/\P{M}\p{M}*|\p{M}+/gu);
  let end = 0;
  for (const { index } of segments) {
    if (index >= LIMIT) break;
    end = index;
  }
  return `${line.slice(0, end).trimEnd()}…`;
}

function textLine(text: string): string {
  const printable = text.replace(CONTROLS, (control, emoji: string | undefined) =>
    emoji || (/\s|\u0085/u.test(control) ? control : ""));
  // Mask delimited values before Markdown cleanup removes the bounds of a multiword value.
  const bounded = printable.replace(BOUNDED_CREDENTIAL, `$1${MASK}`);
  const masked = maskSecrets(stripMarkdown(bounded));
  const unmarked = masked.replace(/(?<!`)(`+)([^`]+)\1(?!`)/g, "$2");
  const line = (unmarked === masked ? masked : maskSecrets(unmarked)).replace(/[\s\u0085]+/gu, " ").trim();
  const sentenceEnd = /[.!?…]+["'”’)\]]*(?= |$)/u.exec(line);
  return clip(sentenceEnd ? line.slice(0, sentenceEnd.index + sentenceEnd[0].length) : line);
}

/** Formats the newest lane step as a short, redacted line for the sub-agent row. */
export function laneStepLine(step: unknown): string {
  if (step === null || typeof step !== "object") return "";

  try {
    if (Array.isArray(step)) return "";
    // Read only own data properties. Formatting a step should never invoke a getter.
    switch (Object.getOwnPropertyDescriptor(step, "kind")?.value) {
      case "tool": {
        const field = Object.getOwnPropertyDescriptor(step, "toolName");
        if (field && !("value" in field)) return "";
        const raw: unknown = field?.value;
        if (raw === undefined) return "Using a tool";
        if (typeof raw !== "string") return "";
        const name = maskSecrets(raw.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, "").trim());
        if (name.includes(MASK)) return `Using ${MASK}`;
        if (!TOOL_NAME.test(name)) return "";
        const key = name.toLowerCase();
        return Object.hasOwn(LANE_TOOL_LABELS, key) ? LANE_TOOL_LABELS[key] : clip(`Using ${name}`);
      }
      case "text": {
        const text = Object.getOwnPropertyDescriptor(step, "text")?.value;
        return typeof text === "string" ? textLine(text) : "";
      }
      case "wait": return "Waiting";
      case "done": return "Done";
      case "error": return "Hit a problem";
      default: return "";
    }
  } catch {
    return "";
  }
}
