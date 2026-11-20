type AddedLine = { line: number; text: string };
type Rule = "empty-catch" | "comment-only-catch" | "empty-promise-catch" | "empty-rejection-handler";
type Finding = { path: string; line: number; rule: Rule };
type Token = AddedLine & { commentBefore: boolean };

const pomeloPath = /^(?:src\/(?:client\/)?pomelo\/.+|test\/pomelo-[^/]*\.test\.ts)$/;
const identifier = /[\p{ID_Continue}$\u200c\u200d]+/u;
const nonCode = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'/;
const sourceToken = new RegExp(`${nonCode.source}|${identifier.source}|=>|\\?\\.|.`, "uy");
const templateFragment = /(?:\\[\s\S]|[^\x60\\$]|\$(?!\{))*(?:\x60|\$\{|$)/y;
const regexLiteral = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/y;
const regexPrefix = /^(?:[=(:,;!&|?~+*%^{\[]|=>|return|throw|case|typeof|void|yield)$/;
const closingToken = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);

function tokenize(source: string, firstLine: number): Token[] {
  const tokens: Token[] = [];
  const code = new RegExp(sourceToken);
  const template = new RegExp(templateFragment);
  const regex = new RegExp(regexLiteral);
  // Each depth is zero in template text and counts braces inside its interpolation.
  const templateDepths: number[] = [];
  let line = firstLine;
  let commentBefore = false;
  let previous = "=";

  for (let offset = 0; offset < source.length;) {
    const depthIndex = templateDepths.length - 1;
    const inTemplateText = templateDepths[depthIndex] === 0;
    const pattern = inTemplateText ? template : code;
    pattern.lastIndex = offset;
    let text = pattern.exec(source)?.[0] ?? source.slice(offset);
    if (!inTemplateText && text === "/" && regexPrefix.test(previous)) {
      regex.lastIndex = offset;
      text = regex.exec(source)?.[0] ?? text;
    }

    if (inTemplateText) {
      if (text.endsWith("${")) {
        templateDepths[depthIndex] = 1;
        previous = "{";
      } else {
        templateDepths.pop();
        previous = "`";
      }
    } else if (text.startsWith("//") || text.startsWith("/*")) {
      if (depthIndex === -1) commentBefore = true;
    } else if (!/^\s/.test(text)) {
      if (depthIndex === -1) {
        tokens.push({ text, line, commentBefore });
        commentBefore = false;
      }
      if (text === "`") templateDepths.push(0);
      else if (depthIndex >= 0 && text === "{") templateDepths[depthIndex]++;
      else if (depthIndex >= 0 && text === "}") templateDepths[depthIndex]--;
      previous = text;
    }
    offset += text.length;
    line += text.split("\n").length - 1;
  }
  return tokens;
}

function matchDelimiters(tokens: Token[]) {
  const closes = new Map<number, number>();
  const opensByClose = new Map<number, number>();
  const opens: number[] = [];
  for (const [index, { text }] of tokens.entries()) {
    if (closingToken.has(text)) {
      opens.push(index);
    } else if (text === ")" || text === "]" || text === "}") {
      const open = opens.pop();
      if (open !== undefined && closingToken.get(tokens[open].text) === text) {
        closes.set(open, index);
        opensByClose.set(index, open);
      } else {
        opens.length = 0;
      }
    }
  }
  return { closes, opensByClose };
}

function isEmptyValue(tokens: Token[], closes: Map<number, number>, start: number, end: number): boolean {
  while (tokens[start]?.text === "(" && closes.get(start) === end - 1) {
    start++;
    end--;
  }
  if (end === start + 1) return tokens[start].text === "undefined" || tokens[start].text === "null";
  return end === start + 2 && tokens[start].text === "void" && tokens[start + 1].text === "0";
}

function emptyBlock(tokens: Token[], closes: Map<number, number>, open: number, close: number): Rule | undefined {
  let start = open + 1;
  let end = close;
  while (tokens[start].text === ";") start++;
  while (end > start && tokens[end - 1].text === ";") end--;
  if (start === end) {
    const hasComment = tokens.slice(open + 1, close + 1).some((token) => token.commentBefore);
    return hasComment ? "comment-only-catch" : "empty-catch";
  }
  if (tokens[start].text === "return" && (start + 1 === end || isEmptyValue(tokens, closes, start + 1, end))) {
    return "empty-catch";
  }
}

function emptyHandler(tokens: Token[], closes: Map<number, number>, start: number, end: number): boolean {
  while (tokens[start]?.text === "(" && closes.get(start) === end - 1) {
    start++;
    end--;
  }
  if (start >= end) return false;
  if (end === start + 1) return tokens[start].text === "noop";
  if (tokens[start].text === "async" && tokens[start + 1].text !== "=>") start++;
  const first = tokens[start].text;
  if (first === "function") {
    for (let index = start + 1; index < end; index = (closes.get(index) ?? index) + 1) {
      if (tokens[index].text === "{" && closes.get(index) === end - 1) {
        return emptyBlock(tokens, closes, index, end - 1) !== undefined;
      }
    }
    return false;
  }

  // Skip arrow parameters and an optional TypeScript return annotation.
  if (first !== "(" && !identifier.test(first)) return false;
  let arrow = (closes.get(start) ?? start) + 1;
  if (tokens[arrow]?.text === ":") {
    while (arrow < end && tokens[arrow].text !== "=>") arrow = (closes.get(arrow) ?? arrow) + 1;
  }
  if (tokens[arrow]?.text !== "=>" || arrow + 1 >= end) return false;
  const body = arrow + 1;
  if (tokens[body].text === "{" && closes.get(body) === end - 1) {
    return emptyBlock(tokens, closes, body, end - 1) !== undefined;
  }
  return isEmptyValue(tokens, closes, body, end);
}

function emptyPromiseHandler(tokens: Token[], closes: Map<number, number>, method: number): Rule | undefined {
  const open = method + (tokens[method + 1]?.text === "?." ? 2 : 1);
  const close = closes.get(open);
  if (tokens[open]?.text !== "(" || close === undefined) return;

  const isCatch = tokens[method].text === "catch";
  let argument = 0;
  let start = open + 1;
  for (let end = start; end <= close; end = (closes.get(end) ?? end) + 1) {
    if (end !== close && tokens[end].text !== ",") continue;
    if (argument === (isCatch ? 0 : 1)) {
      if (emptyHandler(tokens, closes, start, end)) {
        return isCatch ? "empty-promise-catch" : "empty-rejection-handler";
      }
      return;
    }
    argument++;
    start = end + 1;
  }
}

function inspectRun(path: string, lines: AddedLine[], findings: Finding[]): void {
  const tokens = tokenize(lines.map(({ text }) => text).join("\n"), lines[0].line);
  const { closes, opensByClose } = matchDelimiters(tokens);
  for (const [index, { text, line }] of tokens.entries()) {
    if (text !== "catch" && text !== "then") continue;
    const previous = tokens[index - 1]?.text;
    let rule: Rule | undefined;
    if (previous === "." || previous === "?.") {
      rule = emptyPromiseHandler(tokens, closes, index);
    } else if (text === "catch" && (previous === "}" || previous === undefined)) {
      const tryOpen = opensByClose.get(index - 1);
      if (tryOpen !== undefined && tryOpen > 0 && tokens[tryOpen - 1].text !== "try") continue;
      const next = index + 1;
      const open = tokens[next]?.text === "(" ? (closes.get(next) ?? next) + 1 : next;
      const close = closes.get(open);
      if (tokens[open]?.text === "{" && close !== undefined) rule = emptyBlock(tokens, closes, open, close);
    }
    if (rule) findings.push({ path, line, rule });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAddedLine(value: unknown): value is AddedLine {
  return isRecord(value) && typeof value.line === "number" && Number.isSafeInteger(value.line)
    && value.line > 0 && typeof value.text === "string" && !value.text.includes("\n");
}

/** Inspect complete handlers in consecutive added lines. The allowlist contains exact repository paths. */
export function swallowedErrors(files: unknown, allow: readonly string[] = []): Finding[] {
  if (!Array.isArray(files)) return [];
  const allowedPaths = new Set(Array.isArray(allow) ? allow : []);
  const findings: Finding[] = [];
  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string" || !Array.isArray(file.added)) continue;
    if (!pomeloPath.test(file.path) || allowedPaths.has(file.path)) continue;

    const added = file.added.filter(isAddedLine).sort((a, b) => a.line - b.line);
    let run: AddedLine[] = [];
    for (const line of added) {
      // A gap could hide a statement in the handler or change the meaning of a delimiter.
      if (run.length && line.line !== run.at(-1)!.line + 1) {
        inspectRun(file.path, run, findings);
        run = [];
      }
      run.push(line);
    }
    if (run.length) inspectRun(file.path, run, findings);
  }
  return findings.sort((a, b) => a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1);
}
