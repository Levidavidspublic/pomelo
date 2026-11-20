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
const jsxStart = /<(?=>|[\p{ID_Start}_$][\p{ID_Continue}$:.\-]*(?=[\s/<>])(?!\s*(?:[,=]|extends\b)))/u;
const jsxSourceToken = new RegExp(`${sourceToken.source}|${regexStart.source}${jsxStart.source}`, "gu");
const jsxAttribute = /"[^"]*"|'[^']*'/;
const jsxTagToken = new RegExp(`(${comments.source})|(${jsxAttribute.source})|/>|[<>{]|[^"'/<>{]+`, "g");
const jsxTextToken = /<\/[\p{ID_Continue}$:.\-]*\s*>|[<{]|[^<{]+/gu;
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
type ScanContext =
  | { kind: "template"; depth: number; url: boolean; windows: boolean }
  | { kind: "jsx-expression"; depth: number }
  | { kind: "jsx-tag"; typeDepth: number }
  | { kind: "jsx-text" };

function maskLiterals(source: string, matches: Match[], jsx: boolean): string {
  const codeTokens = new RegExp(jsx ? jsxSourceToken : sourceToken);
  const tagTokens = new RegExp(jsxTagToken);
  const textTokens = new RegExp(jsxTextToken);
  const template = new RegExp(templatePart);
  const contexts: ScanContext[] = [];
  const code: string[] = [];
  let cursor = 0;
  let offset = 0;

  while (offset < source.length) {
    const context = contexts.at(-1);
    const tokens = context?.kind === "jsx-text" ? textTokens
      : context?.kind === "jsx-tag" ? tagTokens : codeTokens;
    tokens.lastIndex = offset;
    const token = tokens.exec(source);
    if (!token) break;
    const [part, comment, literal] = token;
    offset = tokens.lastIndex;
    const templateTail = part === "}" && context?.kind === "template" && context.depth === 0;
    let markToken = true;

    if (context?.kind === "jsx-text") {
      if (part === "<") contexts.push({ kind: "jsx-tag", typeDepth: 0 });
      else if (part === "{") contexts.push({ kind: "jsx-expression", depth: 0 });
      else if (part.startsWith("</")) contexts.pop();
      else markToken = false;
    } else if (context?.kind === "jsx-tag" && literal === undefined) {
      if (part === "{") contexts.push({ kind: "jsx-expression", depth: 0 });
      else if (part === "<") context.typeDepth++;
      else if (part === ">" && context.typeDepth > 0) context.typeDepth--;
      else if (part === ">") contexts[contexts.length - 1] = { kind: "jsx-text" };
      else if (part === "/>") contexts.pop();
      else markToken = false;
    } else if (part === "<") {
      contexts.push({ kind: "jsx-tag", typeDepth: 0 });
    } else if (part === "`" || templateTail) {
      template.lastIndex = offset;
      const [, text, end] = template.exec(source)!;
      const interpolated = end === "${";
      const templateUrl = templateTail ? context.url : url.test(text);
      const windows = templateTail ? context.windows : windowsPath.test(text);
      if (templateTail) contexts.pop();
      if (interpolated) contexts.push({ kind: "template", depth: 0, url: templateUrl, windows });
      if (!templateUrl) {
        // An expression may supply more of the same path segment on either side.
        const value = (templateTail ? "#" : "") + text + (interpolated ? "#" : "");
        for (const kind of literalKinds(value, windows)) matches.push({ offset: token.index, kind });
      }
      offset = template.lastIndex;
    } else if (part === "{" || part === "}") {
      if (part === "}" && context?.kind === "jsx-expression" && context.depth === 0) {
        contexts.pop();
      } else {
        if (context?.kind === "template" || context?.kind === "jsx-expression") {
          context.depth += part === "{" ? 1 : -1;
        }
        continue;
      }
    } else {
      const value = literal?.slice(1, -1);
      if (value !== undefined && !url.test(value)) {
        for (const kind of literalKinds(value)) matches.push({ offset: token.index, kind });
      }
      markToken = comment === undefined;
    }
    // Keep offsets and line breaks. A semicolon marks a token without looking like a method body.
    const masked = source.slice(token.index, offset).replace(/[^\n]/g, " ");
    code.push(source.slice(cursor, token.index), markToken ? ";" + masked.slice(1) : masked);
    cursor = offset;
  }
  return code.join("") + source.slice(cursor);
}

function scanBlock(lines: readonly PathGuardLine[], path: string, findings: HardCodedPathFinding[]): void {
  const source = lines.map(({ text }) => text).join("\n");
  const matches: Match[] = [];
  const code = maskLiterals(source, matches, /\.[jt]sx$/i.test(path));
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
