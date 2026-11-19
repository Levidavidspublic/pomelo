export type FlakyTestLine = {
  readonly line: number;
  readonly text: string;
};

export type FlakyTestFile = {
  readonly path: string;
  readonly addedLines: readonly FlakyTestLine[];
};

export type FlakyTestKind = "clock" | "random" | "sleep";

export type FlakyTestFinding = {
  path: string;
  line: number;
  kind: FlakyTestKind;
};

export type FlakyTestResult = {
  ok: boolean;
  findings: FlakyTestFinding[];
};

type Token = { value: string; line: number };

const pomeloTest = /^test\/pomelo-[^/\r\n]*\.test\.ts$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const comments = /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)/;
const strings = /"(?:\\[\s\S]|[^"\\\r\n])*"?|'(?:\\[\s\S]|[^'\\\r\n])*'?/;
const identifier = /[$_\p{ID_Start}][$\p{ID_Continue}\u200c\u200d]*/u;
const token = /\?\.|=>|\s+|./;

function scanCode(source: string, line: number): Token[] {
  const code = new RegExp([comments, strings, identifier, token].map((part) => part.source).join("|"), "suy");
  const template = /(?:\\(?:[\s\S]|$)|[^\\`$]|\$(?!\{))*(`|\$\{|$)/y;
  const regexLiteral = /\/(?:\\[^\r\n]|[^/\\[\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\])+\/[dgimsuvy]*/y;
  const regexPredecessor = /^(?:[=(:,;!&|?{\[]|=>|return|throw|yield|case)$/;
  const tokens: Token[] = [];
  const interpolations: number[] = [];
  let inTemplate = false;

  for (let offset = 0; offset < source.length;) {
    const pattern = inTemplate ? template : code;
    pattern.lastIndex = offset;
    const match = pattern.exec(source)!;
    offset = pattern.lastIndex;
    let value = match[0];
    const startLine = line;
    for (const _ of value.matchAll(/\n/g)) line++;

    if (inTemplate) {
      const end = match[1];
      if (!end) break;
      inTemplate = false;
      if (end === "${") interpolations.push(1);
      value = end === "${" ? "(" : ")";
    } else if (/^\s/.test(value) || value.startsWith("//") || value.startsWith("/*")) {
      continue;
    } else if (value[0] === '"' || value[0] === "'") {
      value = "<literal>";
    } else if (value === "/") {
      const previous = tokens.at(-1)?.value;
      if (!previous || regexPredecessor.test(previous)) {
        regexLiteral.lastIndex = offset - 1;
        if (regexLiteral.test(source)) {
          offset = regexLiteral.lastIndex;
          value = "<literal>";
        }
      }
    } else if (value === "`") {
      // Keep template expressions visible and represent the literal as a balanced group.
      inTemplate = true;
      value = "(";
    } else if (interpolations.length > 0) {
      const frame = interpolations.length - 1;
      if (value === "{") interpolations[frame]++;
      if (value === "}") {
        interpolations[frame]--;
        if (interpolations[frame] === 0) {
          interpolations.pop();
          inTemplate = true;
          value = ")";
        }
      }
    }
    tokens.push({ value, line: startLine });
  }

  return tokens;
}

function hasTimerWait(tokens: readonly Token[], open: number, awaited: boolean): boolean {
  const first = tokens[open + 1]?.value;
  if (!first || first === ")") return false;

  let depth = 0;
  let callback = false;
  for (let index = open + 1; index < tokens.length; index++) {
    const { value } = tokens[index];
    if (depth === 0) {
      if (value === ")") break;
      if (value === ",") {
        const next = tokens[index + 1]?.value;
        if (next && next !== ")") return true;
        break;
      }
      if (value === "=>" || value === "function") callback = true;
    }
    if (value === "(" || value === "[" || value === "{") depth++;
    if (value === ")" || value === "]" || value === "}") depth--;
  }

  // Promise timers take the wait first. Callback timers need a second argument.
  return !callback && (awaited || /^\d/.test(first));
}

function findKind(tokens: readonly Token[], index: number): FlakyTestKind | undefined {
  const { value } = tokens[index];
  const previous = tokens[index - 1]?.value;
  const next = tokens[index + 1]?.value;
  const member = tokens[index + 2]?.value;
  const memberCall = tokens[index + 3]?.value === "(";
  const access = next === "." || next === "?.";

  if (access && member === "now" && memberCall && (value === "Date" || value === "performance")) return "clock";
  if (value === "Date" && previous === "new" && next === "(" && member === ")") return "clock";
  if (access && value === "Math" && member === "random") return "random";
  if (next === "(" && (value === "randomUUID" || value === "randomBytes") && previous !== "function") return "random";
  if (value === "sleep" && previous === "await" && next === "(") return "sleep";
  if (next === "(" && (value === "setTimeout" || value === "setInterval")) {
    const awaited = previous === "await" || (previous === "." && tokens[index - 3]?.value === "await");
    if (hasTimerWait(tokens, index + 1, awaited)) return "sleep";
  }
}

function scanAddedLines(path: string, addedLines: readonly unknown[], findings: FlakyTestFinding[]): void {
  const kindsByLine = new Map<number, Set<FlakyTestKind>>();
  let chunk: string[] = [];
  let lastLine = 0;

  function scanChunk() {
    if (chunk.length === 0) return;
    const tokens = scanCode(chunk.join("\n"), lastLine - chunk.length + 1);
    for (let index = 0; index < tokens.length; index++) {
      const kind = findKind(tokens, index);
      if (!kind) continue;
      const { line } = tokens[index];
      const kinds = kindsByLine.get(line) ?? new Set<FlakyTestKind>();
      kinds.add(kind);
      kindsByLine.set(line, kinds);
    }
    chunk = [];
  }

  for (const added of addedLines) {
    if (!isRecord(added)) continue;
    const { line, text } = added;
    if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1 || typeof text !== "string") continue;
    // A gap can hide the end of a comment or literal, so scan each run of additions on its own.
    if (line !== lastLine + 1) scanChunk();
    chunk.push(text);
    lastLine = line;
  }
  scanChunk();

  for (const [line, kinds] of kindsByLine) {
    for (const kind of kinds) findings.push({ path, line, kind });
  }
}

/** Inspect only added lines, and return locations and kinds without including source text. */
export function findFlakyTestLines(files: unknown): FlakyTestResult {
  const findings: FlakyTestFinding[] = [];
  if (Array.isArray(files)) {
    for (const file of files) {
      if (!isRecord(file) || typeof file.path !== "string" || !Array.isArray(file.addedLines)) continue;
      if (pomeloTest.test(file.path.replaceAll("\\", "/"))) scanAddedLines(file.path, file.addedLines, findings);
    }
  }
  return { ok: findings.length === 0, findings };
}
