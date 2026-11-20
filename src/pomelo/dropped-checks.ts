export type DroppedCheckLine = {
  readonly line: number;
  readonly text: string;
};

export type DroppedCheckFile = {
  readonly path: string;
  readonly removedLines: readonly DroppedCheckLine[];
  readonly addedLines: readonly DroppedCheckLine[];
};

type DroppedCheckHit = {
  path: string;
  removed: number;
  added: number;
  removedLines: number[];
  removedTests: string[];
};

type Token = { text: string; line: number };
type LineChecks = { assertions: Set<number>; tests: string[] };

const sourceToken = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|\x60(?:\\[\s\S]|[^\x60\\])*\x60|[\w$]+|=>|\?\.|./g;
const regexLiteral = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/y;
const regexPrefix = /^(?:[=(:,;!&|?~+*%^{\[]|=>|return|throw|case|typeof|void|yield)$/;
const identifier = /^[A-Za-z_$][\w$]*$/;
const closingToken = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);

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
    if (!/^\s|^\/\/|^\/\*/.test(text)) tokens.push({ text, line });
    line += text.split("\n").length - 1;
  }
  return tokens;
}

function findClosingTokens(tokens: Token[]): Map<number, number> {
  const closes = new Map<number, number>();
  const opens: number[] = [];
  for (const [index, { text }] of tokens.entries()) {
    if (closingToken.has(text)) {
      opens.push(index);
    } else if (text === ")" || text === "]" || text === "}") {
      const open = opens.pop();
      if (open !== undefined && closingToken.get(tokens[open].text) === text) closes.set(open, index);
      else opens.length = 0;
    }
  }
  return closes;
}

function isBareName(tokens: Token[], index: number): boolean {
  const previous = tokens[index - 1]?.text;
  return previous !== "." && previous !== "?." && previous !== "function";
}

function isAssertion(tokens: Token[], index: number): boolean {
  const { text } = tokens[index];
  const next = tokens[index + 1]?.text;
  if (text === "." || text === "?.") return next === "rejects" || next === "throws";
  if (text === "expect") return isBareName(tokens, index) && next === "(";
  if (text !== "assert") return false;
  if (!isBareName(tokens, index) && !(tokens[index - 2]?.text === "t" && tokens[index - 1].text === ".")) return false;

  let open = index + 1;
  while (tokens[open]?.text === "." && identifier.test(tokens[open + 1]?.text ?? "")) open += 2;
  return tokens[open]?.text === "(";
}

function readTestName(tokens: Token[], closes: Map<number, number>, open: number): string | undefined {
  const first = open + 1;
  let end = first;
  while (end < tokens.length) {
    const { text } = tokens[end];
    if (text === "," || text === ")") break;
    if (text === "=>" || text === "function") return "(unnamed)";
    end = (closes.get(end) ?? end) + 1;
  }

  if (end === tokens.length) return undefined;
  if (end === first) return "(unnamed)";
  const title = tokens[first].text;
  if (end === first + 1 && /^["'\x60]/.test(title)) {
    return title.slice(1, -1).replace(/\\(["'\x60\\])/g, "$1");
  }
  return tokens.slice(first, end).map(({ text }) => text).join(" ");
}

function checkLines(lines: readonly DroppedCheckLine[], requireCompleteTest: boolean): LineChecks {
  const assertions = new Set<number>();
  const tests: string[] = [];
  const sorted = [...lines].sort((a, b) => a.line - b.line);

  // A gap represents unseen source, so only a contiguous run can show a whole removal.
  for (let start = 0, end = 1; end <= sorted.length; end++) {
    if (sorted[end]?.line === sorted[end - 1].line + 1) continue;
    const source = sorted.slice(start, end).map(({ text }) => text).join("\n");
    const tokens = tokenize(source, sorted[start].line);
    const closes = findClosingTokens(tokens);
    start = end;

    for (const [index, { text, line }] of tokens.entries()) {
      if (isAssertion(tokens, index)) assertions.add(line);
      if ((text !== "test" && text !== "it") || !isBareName(tokens, index)) continue;
      const open = index + 1;
      if (tokens[open]?.text !== "(" || (requireCompleteTest && !closes.has(open))) continue;
      const name = readTestName(tokens, closes, open);
      if (name !== undefined) tests.push(name);
    }
  }
  return { assertions, tests };
}

function missingTests(removed: string[], added: string[]): string[] {
  const addedCounts = new Map<string, number>();
  for (const name of added) addedCounts.set(name, (addedCounts.get(name) ?? 0) + 1);
  return removed.filter((name) => {
    const count = addedCounts.get(name) ?? 0;
    if (count === 0) return true;
    addedCounts.set(name, count - 1);
    return false;
  });
}

/**
 * Compare each file's old and new changed lines. Whole-test detection requires the
 * complete removed call to be visible in those lines. Supply both sides of a move
 * in one entry under the destination path.
 */
export function findDroppedChecks(files: readonly DroppedCheckFile[]): { ok: boolean; hits: DroppedCheckHit[] } {
  const hits: DroppedCheckHit[] = [];
  for (const { path, removedLines, addedLines } of files) {
    if (!/^test\/.+\.test\.ts$/.test(path.replaceAll("\\", "/"))) continue;
    const before = checkLines(removedLines, true);
    const after = checkLines(addedLines, false);
    const removed = before.assertions.size;
    const added = after.assertions.size;
    const removedTests = missingTests(before.tests, after.tests);
    if (removed > added || removedTests.length > 0) {
      hits.push({ path, removed, added, removedLines: [...before.assertions], removedTests });
    }
  }
  return { ok: hits.length === 0, hits };
}
