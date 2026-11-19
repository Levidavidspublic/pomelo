export type EmptyTestLine = {
  readonly line: number;
  readonly text: string;
};

export type EmptyTestFile = {
  readonly path: string;
  readonly addedLines: readonly EmptyTestLine[];
};

export type EmptyTestReason = "no-assert" | "empty" | "constant";

export type EmptyTestFinding = {
  path: string;
  line: number;
  name: string;
  reason: EmptyTestReason;
};

export type EmptyTestResult = {
  ok: boolean;
  findings: EmptyTestFinding[];
};

type Token = { text: string; line: number; offset: number };
type Range = { start: number; end: number };

const numberLiteral = /(?:0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|\d[\d_]*n|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)/;
const nonCode = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`/;
const sourceToken = new RegExp(`${nonCode.source}|${numberLiteral.source}|[\\w$]+|=>|\\?\\.|.`, "g");
const regexLiteral = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/y;
const regexPrefix = /^(?:[=(:,;!&|?~+*%^{\[]|=>|return|throw|case|typeof|void|yield)$/;
const stringLiteral = /^["'`]/;
const primitiveLiteral = /^(?:true|false|null|undefined)$/;
const numericToken = /^(?:\d|\.\d)/;
const identifier = /^[A-Za-z_$][\w$]*$/;
const delimiters = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAddedLine(value: unknown): value is EmptyTestLine {
  return isRecord(value) && typeof value.line === "number" && Number.isSafeInteger(value.line)
    && value.line > 0 && typeof value.text === "string";
}

function tokenize(source: string, firstLine: number): Token[] {
  const tokens: Token[] = [];
  const pattern = new RegExp(sourceToken);
  const regex = new RegExp(regexLiteral);
  let line = firstLine;

  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let [text] = match;
    if (text === "/" && regexPrefix.test(tokens.at(-1)?.text ?? "=")) {
      regex.lastIndex = match.index;
      const literal = regex.exec(source);
      if (literal) {
        [text] = literal;
        pattern.lastIndex = regex.lastIndex;
      }
    }
    if (!/^\s|^\/\/|^\/\*/.test(text)) tokens.push({ text, line, offset: match.index });
    line += text.split("\n").length - 1;
  }
  return tokens;
}

function matchDelimiters(tokens: Token[]): Map<number, number> {
  const ends = new Map<number, number>();
  const open: number[] = [];
  for (const [index, { text }] of tokens.entries()) {
    if (delimiters.has(text)) {
      open.push(index);
    } else if (text === ")" || text === "]" || text === "}") {
      const start = open.pop();
      if (start !== undefined && delimiters.get(tokens[start].text) === text) ends.set(start, index);
      else open.length = 0;
    }
  }
  return ends;
}

function callArguments(tokens: Token[], ends: Map<number, number>, open: number, close: number): Range[] {
  const args: Range[] = [];
  let start = open + 1;
  for (let index = start; index < close; index = (ends.get(index) ?? index) + 1) {
    if (tokens[index].text === ",") {
      args.push({ start, end: index });
      start = index + 1;
    }
  }
  if (start < close) args.push({ start, end: close });
  return args;
}

function unparenthesize(tokens: Token[], ends: Map<number, number>, { start, end }: Range): Range {
  while (tokens[start]?.text === "(" && ends.get(start) === end - 1) {
    start++;
    end--;
  }
  return { start, end };
}

function callbackBody(tokens: Token[], ends: Map<number, number>, callback: Range): Range | undefined {
  const { start, end } = unparenthesize(tokens, ends, callback);
  const first = tokens[start]?.text === "async" ? start + 1 : start;
  const isFunction = tokens[first]?.text === "function";
  for (let index = first; index < end; index = (ends.get(index) ?? index) + 1) {
    const { text } = tokens[index];
    if (isFunction && text === "{" && ends.get(index) === end - 1) return { start: index + 1, end: end - 1 };
    if (!isFunction && text === "=>" && index + 1 < end) {
      const bodyStart = index + 1;
      return tokens[bodyStart].text === "{" && ends.get(bodyStart) === end - 1
        ? { start: bodyStart + 1, end: end - 1 }
        : { start: bodyStart, end };
    }
  }
}

function isLiteral(tokens: Token[], ends: Map<number, number>, range: Range): boolean {
  const { start, end } = unparenthesize(tokens, ends, range);
  const value = tokens[start]?.text;
  if (end === start + 2 && (value === "+" || value === "-")) return numericToken.test(tokens[start + 1].text);
  if (end !== start + 1) return false;
  if (value.startsWith("`")) return !value.includes("${");
  return stringLiteral.test(value) || primitiveLiteral.test(value) || numericToken.test(value);
}

function onlyLiterals(tokens: Token[], ends: Map<number, number>, open: number, close: number, count: number): boolean {
  const args = callArguments(tokens, ends, open, close);
  return args.length >= count && args.slice(0, count).every((arg) => isLiteral(tokens, ends, arg));
}

function isConstantAssertion(tokens: Token[], ends: Map<number, number>, method: string, open: number, close: number): boolean {
  if (method === "expect") {
    if (!onlyLiterals(tokens, ends, open, close, 1)) return false;
    const matcher = tokens[close + 2]?.text === "not" && tokens[close + 3]?.text === "." ? close + 4 : close + 2;
    if (tokens[close + 1]?.text !== "." || tokens[matcher + 1]?.text !== "(") return false;
    const matcherClose = ends.get(matcher + 1);
    if (matcherClose === undefined) return false;
    if (/^toBe(?:Truthy|Falsy|Defined|Undefined|Null|NaN)$/.test(tokens[matcher].text)) return true;
    return /^(?:toBe|toEqual|toStrictEqual)$/.test(tokens[matcher].text)
      && onlyLiterals(tokens, ends, matcher + 1, matcherClose, 1);
  }
  if (method === "assert" || method === "ok") return onlyLiterals(tokens, ends, open, close, 1);
  return /^(?:equal|notEqual|strictEqual|notStrictEqual|deepEqual|notDeepEqual|deepStrictEqual|notDeepStrictEqual)$/.test(method)
    && onlyLiterals(tokens, ends, open, close, 2);
}

function bodyReason(tokens: Token[], ends: Map<number, number>, body: Range): EmptyTestReason | undefined {
  if (tokens.slice(body.start, body.end).every(({ text }) => text === ";")) return "empty";

  let hasAssertion = false;
  for (let index = body.start; index < body.end; index++) {
    if (!isBareName(tokens, index)) continue;
    let name = index;
    if (tokens[index].text === "t" && tokens[index + 1]?.text === "." && tokens[index + 2]?.text === "assert") name += 2;
    let method = tokens[name].text;
    if (method !== "assert" && method !== "expect") continue;
    let open = name + 1;
    if (method === "assert") {
      while (tokens[open]?.text === "." && identifier.test(tokens[open + 1]?.text ?? "")) {
        method = tokens[open + 1].text;
        open += 2;
      }
    }
    const close = ends.get(open);
    if (tokens[open]?.text !== "(" || close === undefined || close >= body.end || hasMethodBody(tokens, close)) continue;
    hasAssertion = true;
    if (!isConstantAssertion(tokens, ends, method, open, close)) return undefined;
  }
  return hasAssertion ? "constant" : "no-assert";
}

function isBareName(tokens: Token[], index: number): boolean {
  const previous = tokens[index - 1]?.text;
  return previous !== "." && previous !== "?." && previous !== "function";
}

function hasMethodBody(tokens: Token[], close: number): boolean {
  return tokens[close + 1]?.text === "{" && tokens[close + 1].line === tokens[close].line;
}

function testName(source: string, tokens: Token[], { start, end }: Range): string {
  const first = tokens[start];
  if (start === end || first.text === "{") return "(unnamed)";
  if (end === start + 1 && stringLiteral.test(first.text)) {
    return first.text.slice(1, -1).replace(/\\(["'`\\])/g, "$1").slice(0, 80);
  }
  const last = tokens[end - 1];
  return source.slice(first.offset, last.offset + last.text.length).slice(0, 80);
}

function inspectRun(path: string, lines: EmptyTestLine[], findings: EmptyTestFinding[]): void {
  const source = lines.map(({ text }) => text).join("\n");
  const tokens = tokenize(source, lines[0].line);
  const ends = matchDelimiters(tokens);
  for (const [index, { text, line }] of tokens.entries()) {
    if ((text !== "test" && text !== "it") || !isBareName(tokens, index)) continue;
    const open = index + 1;
    const close = ends.get(open);
    if (tokens[open]?.text !== "(" || close === undefined || hasMethodBody(tokens, close)) continue;
    const args = callArguments(tokens, ends, open, close);
    const callback = args.at(-1);
    const body = callback && callbackBody(tokens, ends, callback);
    const reason = body ? bodyReason(tokens, ends, body) : omittedCallback(tokens, ends, args);
    if (!reason) continue;
    const hasName = args.length > 1 || (args.length === 1 && !body);
    const name = hasName ? testName(source, tokens, args[0]) : "(unnamed)";
    findings.push({ path, line, name, reason });
  }
}

function omittedCallback(tokens: Token[], ends: Map<number, number>, args: Range[]): "empty" | undefined {
  const last = args.at(-1);
  if (!last) return "empty";
  const { start, end } = last;
  const text = tokens[start]?.text ?? "";
  if (text === "{" && ends.get(start) === end - 1) return "empty";
  if (args.length === 1 && end === start + 1 && stringLiteral.test(text)) return "empty";
}

/** Check test calls with inline or omitted callbacks visible in the supplied added lines. */
export function findEmptyTests(files: unknown): EmptyTestResult {
  const findings: EmptyTestFinding[] = [];
  if (!Array.isArray(files)) return { ok: true, findings };

  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string" || !Array.isArray(file.addedLines)) continue;
    const added = file.addedLines.filter(isAddedLine).sort((a, b) => a.line - b.line);
    let run: EmptyTestLine[] = [];
    for (const line of added) {
      // Unseen context may contain assertions or close an open comment or callback.
      if (run.length && line.line !== run.at(-1)!.line + 1) {
        inspectRun(file.path, run, findings);
        run = [];
      }
      run.push(line);
    }
    if (run.length) inspectRun(file.path, run, findings);
  }
  findings.sort((a, b) => a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1);
  return { ok: findings.length === 0, findings };
}
