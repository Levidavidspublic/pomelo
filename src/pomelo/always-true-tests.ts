export type AlwaysTrueTestLine = {
  readonly line: number;
  readonly text: string;
};

export type AlwaysTrueTestFile = {
  readonly path: string;
  readonly addedLines: readonly AlwaysTrueTestLine[];
};

export type AlwaysTrueCheckReason = "truthy-literal" | "identical-operands" | "different-literals" | "empty-callback";

export type AlwaysTrueCheckFinding = {
  path: string;
  line: number;
  reason: AlwaysTrueCheckReason;
};

type Span = "/*" | '"' | "'";
type LineContext = { span?: Span; templates: number[] };
type Argument = { code: string; source: string };

const pomeloTestPath = /^test\/pomelo-[^/\\\r\n]*\.test\.ts$/;
const spanEnd = {
  "/*": /\*\//,
  '"': /^(?:\\.|[^"\\])*"/,
  "'": /^(?:\\.|[^'\\])*'/,
  "`": /^(?:\\.|[^`\\])*`/,
};
const templateBoundary = /^(?:\\.|[^`\\$]|\$(?!\{))*(`|\$\{)/;
const regexLiteral = /^\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\[])+\/[a-z]*/;
const regexPrefix = /(?:^|[=(:,;!&|?~+*%^{\[]|=>|\b(?:return|throw|case))\s*$/;
const numberLiteral = /^(?:0x[\da-f](?:_?[\da-f])*|0b[01](?:_?[01])*|0o[0-7](?:_?[0-7])*|\d(?:_?\d)*)(?:n)?$|^(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:e[+-]?\d(?:_?\d)*)?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAddedLine(value: unknown): value is AlwaysTrueTestLine {
  return isRecord(value) && typeof value.line === "number" && Number.isSafeInteger(value.line)
    && value.line > 0 && typeof value.text === "string" && !value.text.includes("\n");
}

// Keep offsets aligned so strings are opaque for matching but available as operands.
function maskLine(text: string, context: LineContext): Argument {
  const { templates } = context;
  let { span } = context;
  // A conventional block comment prefix may be visible even when its opener is outside the diff.
  if (!span && !templates.length && /^\s*\*(?:\s|$)/.test(text)) return { code: "", source: "" };
  const special = /\/\*|\/\/|["'`/]/g;
  const interpolationSpecial = /\/\*|\/\/|["'`/{}]/g;
  let code = "";
  let source = "";
  function append(part: string, mask = templates.length ? "@" : ""): void {
    code += mask ? mask.repeat(part.length) : part;
    source += mask === " " ? " ".repeat(part.length) : part;
  }

  let offset = 0;
  while (offset < text.length) {
    // Each open template has depth zero in its text and a positive brace depth during interpolation.
    const template = templates.length - 1;
    if (templates[template] === 0) {
      const boundary = templateBoundary.exec(text.slice(offset));
      if (!boundary) {
        append(text.slice(offset));
        break;
      }
      append(boundary[0]);
      offset += boundary[0].length;
      if (boundary[1] === "`") templates.pop();
      else templates[template] = 1;
      continue;
    }
    let contentStart = offset;
    if (!span) {
      const pattern = template >= 0 ? interpolationSpecial : special;
      pattern.lastIndex = offset;
      const match = pattern.exec(text);
      append(text.slice(offset, match?.index));
      if (!match) break;

      offset = match.index;
      contentStart = pattern.lastIndex;
      if (match[0] === "//") {
        if (template >= 0) append(text.slice(offset));
        break;
      }
      if (match[0] === "`") {
        append("`", "@");
        templates.push(0);
        offset = contentStart;
        continue;
      }
      if (match[0] === "{" || match[0] === "}") {
        templates[template] += match[0] === "{" ? 1 : -1;
        append(match[0]);
        offset = contentStart;
        continue;
      }
      if (match[0] === "/") {
        const regex = regexPrefix.test(template >= 0 ? source : code) && regexLiteral.exec(text.slice(offset));
        const literal = regex ? regex[0] : "/";
        append(literal, regex || template >= 0 ? "@" : "");
        offset += literal.length;
        continue;
      }
      span = match[0] as Span;
    }

    const close = spanEnd[span].exec(text.slice(contentStart));
    const end = close ? contentStart + close.index + close[0].length : text.length;
    const part = text.slice(offset, end);
    append(part, span === "/*" && template < 0 ? " " : "@");
    if (close || (span !== "/*" && !/(?:^|[^\\])(?:\\\\)*\\$/.test(part))) span = undefined;
    offset = end;
  }
  context.span = span;
  return { code, source };
}

// Skip nested delimiters when looking for the next argument separator or closing bracket.
function boundary(code: string, start: number, stops: string): number {
  const pending: string[] = [];
  for (let index = start; index < code.length; index++) {
    const char = code[index];
    if (!pending.length && stops.includes(char)) return index;
    if (char === "(") pending.push(")");
    if (char === "[") pending.push("]");
    if (char === "{") pending.push("}");
    if (")]}".includes(char) && char !== pending.pop()) return -1;
  }
  return -1;
}

function trimArgument(code: string, source: string): Argument {
  code = code.trim();
  source = source.trim();
  while (code[0] === "(" && boundary(code, 1, ")") === code.length - 1) {
    code = code.slice(1, -1).trim();
    source = source.slice(1, -1).trim();
  }
  return { code, source };
}

function callArguments({ code, source }: Argument, start: number): Argument[] {
  const args: Argument[] = [];
  for (let end = boundary(code, start, ",)"); end !== -1; end = boundary(code, start, ",)")) {
    args.push(trimArgument(code.slice(start, end), source.slice(start, end)));
    if (code[end] === ")") return args;
    start = end + 1;
  }
  return [];
}

function stringValue(text: string): string | undefined {
  const quote = text[0];
  if ((quote !== '"' && quote !== "'" && quote !== "`") || spanEnd[quote].exec(text.slice(1))?.[0].length !== text.length - 1) return;
  const content = text.slice(1, -1);
  const controls: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "0": "\0" };
  let constant = true;
  const value = content.replace(/\\(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|(.))|\$\{/g,
    (match, codePoint, unicode, hex, escape, offset: number) => {
      if (match === "${") {
        if (quote === "`") constant = false;
        return match;
      }
      if (codePoint || unicode || hex) {
        const point = Number.parseInt(codePoint ?? unicode ?? hex, 16);
        if (point <= 0x10ffff) return String.fromCodePoint(point);
        constant = false;
      } else if (/^[1-9ux]$/.test(escape) || (escape === "0" && /\d/.test(content[offset + 2] ?? ""))) {
        constant = false;
      }
      return controls[escape] ?? escape;
    });
  return constant ? value : undefined;
}

function primitiveValue(text: string): string | number | bigint | boolean | null | undefined {
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  const negative = text.startsWith("-");
  const unsigned = text.replace(/^[+-]\s*/, "");
  if (!numberLiteral.test(unsigned)) return stringValue(text);

  const digits = unsigned.replaceAll("_", "");
  if (digits.endsWith("n")) {
    if (text.startsWith("+")) return;
    const value = BigInt(digits.slice(0, -1));
    return negative ? -value : value;
  }
  const value = Number(digits);
  return negative ? -value : value;
}

function isTruthyLiteral(arg: Argument): boolean {
  if (Boolean(primitiveValue(arg.source))) return true;
  const close = arg.code[0] === "[" ? "]" : arg.code[0] === "{" ? "}" : undefined;
  if (close && boundary(arg.code, 1, close) === arg.code.length - 1) return true;
  return regexLiteral.exec(arg.source)?.[0] === arg.source;
}

function reasonFor(method: string | undefined, [first, second]: Argument[]): AlwaysTrueCheckReason | undefined {
  if (!first?.source) return;
  if (method === undefined || method === "ok") return isTruthyLiteral(first) ? "truthy-literal" : undefined;
  if (method === "doesNotThrow") return /^\(\s*\)\s*=>\s*\{\s*\}$/.test(first.code) ? "empty-callback" : undefined;
  if (!second?.source || first.code.startsWith("...") || second.code.startsWith("...")) return;

  const left = primitiveValue(first.source);
  const right = primitiveValue(second.source);
  const bothLiterals = left !== undefined && right !== undefined;
  if (method === "notEqual") return bothLiterals && !Object.is(left, right) ? "different-literals" : undefined;
  if (first.source === second.source || (bothLiterals && Object.is(left, right))) return "identical-operands";
}

function inspectLine(line: Argument): AlwaysTrueCheckReason | undefined {
  const assertion = /(?<![\p{ID_Continue}$\u200c\u200d])assert\s*(?:\.\s*(ok|equal|strictEqual|deepEqual|deepStrictEqual|notEqual|doesNotThrow)\s*)?\(/gu;
  for (const match of line.code.matchAll(assertion)) {
    if (line.code.slice(0, match.index).trimEnd().endsWith(".")) continue;
    const reason = reasonFor(match[1], callArguments(line, match.index + match[0].length));
    if (reason) return reason;
  }
}

/** Inspect single-line assertions in the supplied added lines. */
export function findAlwaysTrueChecks(files: unknown): AlwaysTrueCheckFinding[] {
  const findings: AlwaysTrueCheckFinding[] = [];
  if (!Array.isArray(files)) return findings;

  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string" || !pomeloTestPath.test(file.path) || !Array.isArray(file.addedLines)) continue;
    let previousLine = 0;
    let context: LineContext = { templates: [] };
    for (const { line, text } of file.addedLines.filter(isAddedLine).sort((a, b) => a.line - b.line)) {
      // Only adjacent added lines give us context for a continued comment or string.
      if (line !== previousLine + 1) context = { templates: [] };
      const masked = maskLine(text, context);
      previousLine = line;
      const reason = inspectLine(masked);
      if (reason) findings.push({ path: file.path, line, reason });
    }
  }
  return findings.sort((a, b) => a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1);
}
