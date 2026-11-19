export interface PathGuardLine {
  readonly line: number;
  readonly text: string;
}

export interface PathGuardFile {
  readonly path: string;
  readonly addedLines: readonly PathGuardLine[];
}

export type HardCodedPathKind = "home" | "friday-home" | "temp";

export interface HardCodedPathFinding {
  path: string;
  line: number;
  kind: HardCodedPathKind;
}

export interface PathGuardResult {
  ok: boolean;
  findings: HardCodedPathFinding[];
}

const pomeloPath = /^(?:src\/(?:client\/)?pomelo\/|test\/pomelo-[^/]*\.test\.ts$)/;
const posixHome = /^(?:\/(?:home|Users|root)|~)\//;
const windowsHome = /^[a-z]:\/Users\//i;
const windowsPath = /^(?:[a-z]:[/\\]|\\)/i;
const fridayFolder = /(?:^|\/)\.friday(?:\/|$)/;
const posixTemp = /^\/(?:var\/)?tmp\//;
const windowsTemp = /(?:^|\/)Temp(?:\/|$)/i;
const url = /^(?:[a-z][a-z\d+.-]*:)?\/\//i;

// Consume comments and literals together so comment delimiters inside a literal stay intact.
const comments = /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)/;
const strings = /"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'/;
const regexStart = /(?<=^\s*|[=(:,;!&|?{\[]\s*|=>\s*|(?<![.\w$])(?:return|throw|yield|case)\s+)/;
const regexLiteral = /\/(?:\\[^\r\n]|[^/\\\[\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\])+\/[dgimsuvy]*/;
const sourceToken = new RegExp(`(${comments.source})|(${strings.source})|${regexStart.source}${regexLiteral.source}|[\x60{}]`, "g");
const templatePart = /((?:\\(?:[\s\S]|$)|\$(?!\{)|[^`\\$])*)(\$\{|`|$)/y;
const homeCall = /(?<![\p{ID_Continue}$])(?<![.#]\s*|\bfunction\s*\*?\s*)(?:os\s*\.\s*)?homedir\s*\(\s*\)(?![^\S\n]*\{)/gu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readFiles(input: unknown): PathGuardFile[] {
  const files: PathGuardFile[] = [];
  try {
    if (!Array.isArray(input)) return files;
    for (const file of input) {
      if (!isRecord(file)) continue;
      const path = file.path;
      if (typeof path !== "string" || !pomeloPath.test(path.replaceAll("\\", "/"))) continue;
      const { addedLines } = file;
      if (!Array.isArray(addedLines)) continue;

      const lines: PathGuardLine[] = [];
      for (const added of addedLines) {
        if (!isRecord(added)) continue;
        const { line, text } = added;
        if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1) continue;
        if (typeof text !== "string" || text.includes("\n")) continue;
        lines.push({ line, text });
      }
      files.push({ path, addedLines: lines.sort((a, b) => a.line - b.line) });
    }
  } catch {
    // Input can contain accessors or proxies that throw during validation.
    return [];
  }
  return files;
}

function literalKinds(value: string, windows = windowsPath.test(value)): HardCodedPathKind[] {
  // Accept Windows separators as written or escaped in source, regardless of the host OS.
  const path = value.replace(/\\+/g, "/");
  const kinds: HardCodedPathKind[] = [];
  if (posixHome.test(value) || windowsHome.test(path)) kinds.push("home");
  if (fridayFolder.test(path)) kinds.push("friday-home");
  if (posixTemp.test(value) || (windows && windowsTemp.test(path))) kinds.push("temp");
  return kinds;
}

type Match = { offset: number; kind: HardCodedPathKind };
type Template = { depth: number; url: boolean; windows: boolean };

function maskLiterals(source: string, matches: Match[]): string {
  const tokens = new RegExp(sourceToken);
  const template = new RegExp(templatePart);
  const expressions: Template[] = [];
  const code: string[] = [];
  let cursor = 0;

  for (let token = tokens.exec(source); token; token = tokens.exec(source)) {
    const [part, comment, literal] = token;
    const expression = expressions.at(-1);
    const opening = part === "`";
    const tail = part === "}" && expression?.depth === 0;
    let replacement: string;

    if (opening || tail) {
      template.lastIndex = tokens.lastIndex;
      const [, text, end] = template.exec(source)!;
      const interpolated = end === "${";
      const context = tail ? expressions.pop()! : {
        depth: 0,
        url: url.test(text),
        windows: windowsPath.test(text),
      };
      if (interpolated) expressions.push(context);
      if (!context.url) {
        // An expression may supply more of the same path segment on either side.
        const value = (tail ? "#" : "") + text + (interpolated ? "#" : "");
        for (const kind of literalKinds(value, context.windows)) matches.push({ offset: token.index, kind });
      }
      tokens.lastIndex = template.lastIndex;
      const masked = source.slice(token.index, tokens.lastIndex).replace(/[^\n]/g, " ");
      replacement = interpolated ? masked.slice(0, -1) + "{" : ";" + masked.slice(1);
    } else if (part === "{" || part === "}") {
      if (expression) expression.depth += part === "{" ? 1 : -1;
      continue;
    } else {
      const value = literal?.slice(1, -1);
      if (value !== undefined && !url.test(value)) {
        for (const kind of literalKinds(value)) matches.push({ offset: token.index, kind });
      }
      // Keep offsets and line breaks. A literal remains a token between its neighbors.
      const masked = part.replace(/[^\n]/g, " ");
      replacement = comment === undefined ? ";" + masked.slice(1) : masked;
    }
    code.push(source.slice(cursor, token.index), replacement);
    cursor = tokens.lastIndex;
  }
  return code.join("") + source.slice(cursor);
}

function scanBlock(lines: readonly PathGuardLine[], path: string, findings: HardCodedPathFinding[]): void {
  const source = lines.map(({ text }) => text).join("\n");
  const matches: Match[] = [];
  const code = maskLiterals(source, matches);
  for (const match of code.matchAll(homeCall)) matches.push({ offset: match.index, kind: "friday-home" });

  let index = 0;
  let nextBreak = source.indexOf("\n");
  const kinds = new Set<HardCodedPathKind>();
  for (const { offset, kind } of matches.sort((a, b) => a.offset - b.offset)) {
    while (nextBreak !== -1 && nextBreak < offset) {
      index++;
      nextBreak = source.indexOf("\n", nextBreak + 1);
      kinds.clear();
    }
    if (kinds.has(kind)) continue;
    kinds.add(kind);
    findings.push({ path, line: lines[index].line, kind });
  }
}

/** Check adjacent added lines together. Gaps have no source context. */
export function findHardCodedPaths(files: unknown): PathGuardResult {
  const findings: HardCodedPathFinding[] = [];
  for (const { path, addedLines: lines } of readFiles(files)) {
    let start = 0;
    for (let end = 1; end <= lines.length; end++) {
      if (lines[end]?.line === lines[end - 1].line + 1) continue;
      scanBlock(lines.slice(start, end), path, findings);
      start = end;
    }
  }
  return { ok: findings.length === 0, findings };
}
