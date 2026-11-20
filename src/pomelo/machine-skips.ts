type Token = { text: string; line: number };
type MachineSkipKind = "platform" | "ci" | "env" | "arch";
type MachineSkipFinding = { path: string; line: number; kind: MachineSkipKind };
type MachineSkipResult = { ok: boolean; findings: MachineSkipFinding[] };

type LexicalState = { inBlockComment: boolean; quote: string; templateBraces: number[] };
type Expression = { opener: string; start: number; ifStart?: number; isBlock?: boolean };

const pomeloTest = /^test\/pomelo-[^/\r\n]*\.test\.ts$/;
const identifier = /^[$\p{ID_Start}][$\p{ID_Continue}\u200C\u200D]*$/u;
const endOfExpression = /^(?:[$\p{ID_Continue}]+|["'].*|[)\]}])$/u;
const literalValue = /^(?:["']|(?:[0-9]+|true|false|null)$)/;
const expressionContinuations = new Set(["as", "in", "instanceof", "satisfies"]);
const expressionSeparators = new Set([";", ",", "=", "=>", ":"]);
const expressionTerminators = new Set([";", ",", ":", ")", "]", "}"]);
const blockPrefixes = new Set(["", ";", "{", "}", ")", "=>", "else", "try", "catch", "finally", "do"]);
const openerFor: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scanLine(tokens: Token[], source: string, line: number, state: LexicalState): void {
  const codeToken = /\s+|[$\p{ID_Start}][$\p{ID_Continue}\u200C\u200D]*|[0-9]+|&&=?|\|\|=?|\?\?=?|\?\.|[<>]=|===?|!==?|=>|./uy;

  for (let index = 0; index < source.length;) {
    if (state.inBlockComment) {
      const end = source.indexOf("*/", index);
      if (end === -1) return;
      state.inBlockComment = false;
      index = end + 2;
      continue;
    }

    const char = source[index];
    if (state.quote || char === '"' || char === "'" || char === "`") {
      const quote = state.quote || char;
      const start = index;
      const startsHere = !state.quote;
      if (startsHere) {
        index++;
        if (quote === "`") tokens.push({ text: '""', line });
      }
      state.quote = quote;
      while (index < source.length) {
        const next = source[index++];
        if (next === quote) {
          state.quote = "";
          break;
        }
        if (next === "\\") {
          if (index === source.length) {
            if (startsHere && quote !== "`") tokens.push({ text: '""', line });
            return;
          }
          index++;
        } else if (quote === "`" && next === "$" && source[index] === "{") {
          // Only literal template text is hidden. Interpolations contain code.
          state.templateBraces.push(0);
          tokens.push({ text: "(", line });
          state.quote = "";
          index++;
          break;
        }
      }
      if (startsHere && quote !== "`") {
        const literal = state.quote ? '""' : source.slice(start, index);
        tokens.push({ text: literal, line });
      }
      if (state.quote !== "`") state.quote = "";
      continue;
    }

    if (source.startsWith("//", index)) return;
    if (source.startsWith("/*", index)) {
      state.inBlockComment = true;
      index += 2;
      continue;
    }
    const template = state.templateBraces.length - 1;
    if (template >= 0 && char === "{") state.templateBraces[template]++;
    if (template >= 0 && char === "}") {
      if (state.templateBraces[template] === 0) {
        state.templateBraces.pop();
        tokens.push({ text: ")", line });
        state.quote = "`";
        index++;
        continue;
      }
      state.templateBraces[template]--;
    }

    codeToken.lastIndex = index;
    const match = codeToken.exec(source);
    if (!match) {
      index++;
      continue;
    }
    index = codeToken.lastIndex;
    if (match[0].trim()) tokens.push({ text: match[0], line });
  }
}

function memberAt(tokens: readonly Token[], index: number) {
  let next = index;
  const access = tokens[next]?.text;
  if (access === "." || access === "?.") {
    const key = tokens[++next]?.text;
    if (key && identifier.test(key)) return { key, end: next + 1 };
  }

  if (tokens[next]?.text !== "[" || tokens[next + 2]?.text !== "]") return;
  const literal = tokens[next + 1].text;
  const key = literal.slice(1, -1);
  if (key && (literal.startsWith('"') || literal.startsWith("'"))) {
    return { key, end: next + 3 };
  }
}

function machineKind(tokens: readonly Token[], index: number): MachineSkipKind | undefined {
  const receiver = tokens[index].text;
  if (receiver !== "process" && receiver !== "os") return;
  const previous = tokens[index - 1]?.text;
  if (previous === "." || previous === "?.") return;

  const member = memberAt(tokens, index + 1);
  if (member?.key === "env" && receiver === "process") {
    const variable = memberAt(tokens, member.end);
    if (variable) return variable.key === "CI" ? "ci" : "env";
  }

  if (member?.key !== "platform" && member?.key !== "arch") return;
  if (receiver === "process" || tokens[member.end]?.text === "(") return member.key;
}

function startsNewStatement(previous: Token, next: Token): boolean {
  return previous.line !== next.line && identifier.test(next.text)
    && !expressionContinuations.has(next.text) && endOfExpression.test(previous.text);
}

function hasLiteralFallback(tokens: readonly Token[], operatorIndex: number): boolean {
  const value = tokens[operatorIndex + 1];
  if (!value || !literalValue.test(value.text)) return false;
  const next = tokens[operatorIndex + 2];
  return !next || expressionTerminators.has(next.text) || startsNewStatement(value, next);
}

function scanChunk(path: string, tokens: readonly Token[], findings: MachineSkipFinding[]): void {
  const expressions: Expression[] = [{ opener: "", start: 0 }];
  const references: { line: number; kind: MachineSkipKind }[] = [];
  const conditionEnds: number[] = [];

  // Mark ranges of machine references, then report them in source order.
  const markCondition = (start: number) => {
    if (start < references.length) conditionEnds[start] = references.length;
  };

  for (const [index, token] of tokens.entries()) {
    const { text, line } = token;
    const previous = tokens[index - 1];
    const expression = expressions[expressions.length - 1];
    if ((!expression.opener || expression.opener === "{") && previous && startsNewStatement(previous, token)) {
      // A new statement can follow an expression without a semicolon.
      expression.start = references.length;
    }

    if (text === "(" || text === "[" || text === "{") {
      const beforePrevious = tokens[index - 2]?.text;
      const isIf = text === "(" && previous?.text === "if" && beforePrevious !== "." && beforePrevious !== "?.";
      const isBlock = text === "{" && blockPrefixes.has(previous?.text ?? "");
      expressions.push({ opener: text, start: references.length, ifStart: isIf ? references.length : undefined, isBlock });
    } else if (Object.hasOwn(openerFor, text)) {
      if (expression.opener === openerFor[text]) {
        expressions.pop();
        if (expression.ifStart !== undefined) markCondition(expression.ifStart);
        else if (!expression.isBlock) continue;
      }
      expressions[expressions.length - 1].start = references.length;
    } else if (text === "&&" || text === "||" || text === "?") {
      // A literal fallback supplies a value without conditionally running code.
      if (text !== "||" || !hasLiteralFallback(tokens, index)) markCondition(expression.start);
      expression.start = references.length;
    } else if (expressionSeparators.has(text)) {
      expression.start = references.length;
    } else {
      const kind = machineKind(tokens, index);
      if (kind) references.push({ line, kind });
    }
  }

  for (const expression of expressions) {
    if (expression.ifStart !== undefined) markCondition(expression.ifStart);
  }

  let conditionEnd = 0;
  let lastLine = 0;
  const kindsOnLine = new Set<MachineSkipKind>();
  for (const [index, { line, kind }] of references.entries()) {
    conditionEnd = Math.max(conditionEnd, conditionEnds[index] ?? 0);
    if (index >= conditionEnd) continue;
    if (line !== lastLine) kindsOnLine.clear();
    lastLine = line;
    if (kindsOnLine.has(kind)) continue;
    kindsOnLine.add(kind);
    findings.push({ path, line, kind });
  }
}

/** Report machine-dependent conditions in added Pomelo test lines. */
export function findMachineSkips(files: unknown): MachineSkipResult {
  const findings: MachineSkipFinding[] = [];
  if (!Array.isArray(files)) return { ok: true, findings };

  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string" || !Array.isArray(file.addedLines)) continue;
    if (!pomeloTest.test(file.path.replaceAll("\\", "/"))) continue;

    const state: LexicalState = { inBlockComment: false, quote: "", templateBraces: [] };
    let tokens: Token[] = [];
    let previousLine = 0;
    for (const added of file.addedLines) {
      if (!isRecord(added)) continue;
      const { line, text } = added;
      if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1 || typeof text !== "string") continue;
      // An unchanged line may close a comment, string, or expression.
      if (line !== previousLine + 1) {
        scanChunk(file.path, tokens, findings);
        tokens = [];
        state.inBlockComment = false;
        state.quote = "";
        state.templateBraces.length = 0;
      }
      scanLine(tokens, text, line, state);
      previousLine = line;
    }
    scanChunk(file.path, tokens, findings);
  }

  return { ok: findings.length === 0, findings };
}
