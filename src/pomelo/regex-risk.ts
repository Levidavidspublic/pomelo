import type { AddedLine } from "./e2e-mocks.js";

const REASONS = {
  "nested-repeat": "An unbounded group ends with an unbounded repeat.",
  "double-wildcard": "Two adjacent wildcards have unbounded repeats.",
};

type Kind = keyof typeof REASONS;

export interface RegexRiskFinding {
  path: string;
  line: number;
  kind: Kind;
  reason: string;
}

const TEST_PATH = /\/(?:__tests__|tests?)\/|\.(?:test|spec)\.[^/]+$/;
const COMMENT_CONTINUATION = /^\s*\*(?:\s|\/|$)/;
const CODE_TOKEN = /[\p{ID_Continue}$]+|\s+|\+\+|--|./uy;
const REGEX_FLAGS = /[a-z]*/iy;
const QUANTIFIER = /[+*?]|\{\d+,\d*\}|\{\d+\}/y;
const STRING_ESCAPE = /\\(?:u\{[\da-f]+\}|u[\da-f]{4}|x[\da-f]{2}|[0-3][0-7]{2}|[0-7]{1,2}|\r\n|[\s\S])/gi;
const SIMPLE_ESCAPES: Record<string, string> = {
  b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\n": "", "\r": "", "\r\n": "",
};
const EXPRESSION_KEYWORDS = new Set([
  "await", "case", "delete", "do", "else", "in", "instanceof", "of", "return", "throw", "typeof", "void", "yield",
]);
const CONTROL_HEADS = new Set(["if", "while", "for", "with", "switch", "catch"]);

function isAddedLine(value: unknown): value is AddedLine {
  if (value === null || typeof value !== "object") return false;
  const { path, line, text } = value as Partial<AddedLine>;
  return typeof path === "string" && typeof text === "string"
    && typeof line === "number" && Number.isSafeInteger(line) && line > 0;
}

function patternRisk(pattern: string, unicodeSets = false): Kind | undefined {
  let groupDepth = 0;
  let classDepth = 0;
  let previousRepeat = false;
  let previousWildcardRepeat = false;

  for (let index = 0; index < pattern.length; index++) {
    const atom = pattern[index];
    let groupEndsInRepeat = false;
    if (atom === "\\") {
      index++;
      if (classDepth > 0) continue;
    } else if (atom === "[" && (classDepth === 0 || unicodeSets)) {
      classDepth++;
      continue;
    } else if (classDepth > 0) {
      if (atom !== "]" || --classDepth > 0) continue;
    } else if (atom === "(") {
      groupDepth++;
      previousRepeat = previousWildcardRepeat = false;
      continue;
    } else if (atom === ")" && groupDepth > 0) {
      groupDepth--;
      groupEndsInRepeat = previousRepeat;
    }

    QUANTIFIER.lastIndex = index + 1;
    const quantifier = QUANTIFIER.exec(pattern)?.[0];
    const unbounded = quantifier === "*" || quantifier === "+" || quantifier?.endsWith(",}") === true;
    const wildcardRepeat = atom === "." && unbounded;
    if (groupEndsInRepeat && unbounded) return "nested-repeat";
    if (previousWildcardRepeat && wildcardRepeat) return "double-wildcard";
    previousRepeat = unbounded;
    previousWildcardRepeat = wildcardRepeat;

    if (quantifier) {
      index += quantifier.length;
      if (pattern[index + 1] === "?") index++;
    }
  }
}

function regexEnd(source: string, start: number): number {
  let inClass = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === "\\") index++;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) return index;
  }
  return -1;
}

function stringEnd(source: string, start: number): { end: number; interpolated: boolean } {
  const quote = source[start];
  let interpolated = false;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (char === "\\") index++;
    else if (char === quote) return { end: index, interpolated };
    else if (quote === "`" && char === "$" && source[index + 1] === "{") interpolated = true;
  }
  return { end: -1, interpolated };
}

function decodeString(source: string): string {
  return source.replace(STRING_ESCAPE, (match) => {
    const escape = match.slice(1);
    if (escape.length > 1 && escape.startsWith("u")) {
      const digits = escape[1] === "{" ? escape.slice(2, -1) : escape.slice(1);
      const codePoint = Number.parseInt(digits, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : escape;
    }
    if (escape.length > 1 && escape.startsWith("x")) return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
    if (escape[0] >= "0" && escape[0] <= "7") return String.fromCharCode(Number.parseInt(escape, 8));
    return SIMPLE_ESCAPES[escape] ?? escape;
  });
}

function scanLine(source: string, inBlockComment: boolean): { kind?: Kind; inBlockComment: boolean } {
  let offset = 0;
  if (inBlockComment || COMMENT_CONTINUATION.test(source)) {
    const end = source.indexOf("*/");
    if (end === -1) return { inBlockComment };
    offset = end + 2;
  }

  let kind: Kind | undefined;
  // A quoted argument is only static when it ends at the next comma or closing parenthesis.
  let stringRisk: Kind | undefined;
  let expectsOperand = true;
  let previousToken = "";
  let constructorPrefix = "";
  const controlHeads: boolean[] = [];
  while (offset < source.length) {
    if (source.startsWith("//", offset)) break;
    if (source.startsWith("/*", offset)) {
      const end = source.indexOf("*/", offset + 2);
      if (end === -1) return { kind: kind ?? stringRisk, inBlockComment: true };
      offset = end + 2;
      continue;
    }

    CODE_TOKEN.lastIndex = offset;
    const token = CODE_TOKEN.exec(source)![0];
    const start = offset;
    offset += token.length;
    if (token.trim() === "") continue;

    if (token === ")" || token === ",") kind ??= stringRisk;
    stringRisk = undefined;
    if (token === '"' || token === "'" || token === "`") {
      const { end, interpolated } = stringEnd(source, start);
      if (end === -1) break;
      if (!kind && constructorPrefix === "(" && !interpolated) {
        stringRisk = patternRisk(decodeString(source.slice(offset, end)));
      }
      offset = end + 1;
    } else if (token === "/" && expectsOperand && source[offset] !== "=") {
      const end = regexEnd(source, offset);
      if (end === -1) break;
      REGEX_FLAGS.lastIndex = end + 1;
      const flags = REGEX_FLAGS.exec(source)![0];
      kind ??= patternRisk(source.slice(offset, end), flags.includes("v"));
      offset = end + 1 + flags.length;
      expectsOperand = false;
      constructorPrefix = "";
      previousToken = "literal";
      continue;
    }

    // A control statement can start with a regex after its closing parenthesis.
    if (token === "(") controlHeads.push(CONTROL_HEADS.has(previousToken));
    if (token === ")") expectsOperand = controlHeads.pop() === true;
    else expectsOperand = EXPRESSION_KEYWORDS.has(token) || "=(:,;[!&|?{}%^~+-*<>/".includes(token);

    if (token === "new") constructorPrefix = "new";
    else if (constructorPrefix === "new" && token === "RegExp") constructorPrefix = "RegExp";
    else if (constructorPrefix === "RegExp" && token === "(") constructorPrefix = "(";
    else constructorPrefix = "";
    previousToken = token;
  }

  return { kind: kind ?? stringRisk, inBlockComment: false };
}

/** Report risky regex syntax on added Pomelo source lines without running the pattern. */
export function slowPatternLines(added: unknown): RegexRiskFinding[] {
  if (!Array.isArray(added)) return [];

  const findings: RegexRiskFinding[] = [];
  const blockComments = new Map<string, number>();
  const reported = new Set<string>();
  for (const value of added) {
    if (!isAddedLine(value)) continue;
    const { path, line, text } = value;
    const normalizedPath = path.replaceAll("\\", "/");
    if (!normalizedPath.startsWith("src/pomelo/") && !normalizedPath.startsWith("src/client/pomelo/")) continue;
    if (TEST_PATH.test(normalizedPath)) continue;

    const lastCommentLine = blockComments.get(normalizedPath);
    const { kind, inBlockComment } = scanLine(text, lastCommentLine === line - 1);
    if (inBlockComment) blockComments.set(normalizedPath, line);
    else blockComments.delete(normalizedPath);

    const location = `${normalizedPath}:${line}`;
    if (!kind || reported.has(location)) continue;
    reported.add(location);
    findings.push({ path, line, kind, reason: REASONS[kind] });
  }
  return findings;
}
