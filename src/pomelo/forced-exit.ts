type AddedLine = { line: number; text: string };
type Token = { line: number; text: string };
type Rule = "process-exit" | "exit-code-set" | "process-abort" | "process-kill-self" | "error-event-takeover";
type Finding = { path: string; line: number; rule: Rule };

const POMELO_PATH = /^(?:src\/(?:client\/)?pomelo\/|test\/pomelo-[^/]*\.test\.ts$)/;
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u;
const ASSIGNMENT = /^(?:[-+*/%&|^]|\*\*|&&|\|\||\?\?|<<|>>>?)?=$/;
const UPDATE = /^(?:\+\+|--)$/;
const ERROR_EVENTS = new Set(["uncaughtException", "unhandledRejection"]);
const ERROR_LISTENER_METHODS = new Set([
  "on", "once", "addListener", "prependListener", "prependOnceListener", "removeAllListeners",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAddedLine(value: unknown): value is AddedLine {
  return isRecord(value) && typeof value.line === "number" && Number.isSafeInteger(value.line)
    && value.line > 0 && typeof value.text === "string" && !value.text.includes("\n");
}

function tokenize(source: string, firstLine: number): Token[] {
  // Keep literal tokens intact for static property names and event arguments.
  const lexeme = /\s+|\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*'|[\p{ID_Continue}$\u200c\u200d]+|\?\.|===?|!==?|=>|(?:[-+*/%&|^]|\*\*|&&|\|\||\?\?|<<|>>>?)=|\+\+|--|./gsu;
  const regexLiteral = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/y;
  const regexPrefix = /^(?:[=(:,;!&|?~+*%^{\[]|\$\{|=>|return|throw|case|typeof|void|yield)$/;
  const templatePart = /(?:\\[\s\S]|[^`\\$]|\$(?!\{))*(`|\$\{|$)/y;
  const interpolationBraces: number[] = [];
  const tokens: Token[] = [];
  let line = firstLine;

  for (let match = lexeme.exec(source); match; match = lexeme.exec(source)) {
    let [text] = match;
    const depth = interpolationBraces.length - 1;
    if (text === "`" || (text === "}" && interpolationBraces[depth] === 0)) {
      if (text === "}") interpolationBraces.pop();
      templatePart.lastIndex = lexeme.lastIndex;
      const part = templatePart.exec(source);
      if (part) {
        const start = line;
        line += part[0].split("\n").length - 1;
        lexeme.lastIndex = templatePart.lastIndex;
        // Template text is opaque. Interpolations return to ordinary code scanning.
        if (part[1] === "${") {
          interpolationBraces.push(0);
          tokens.push({ text: "${", line });
        } else {
          tokens.push({ text: text + part[0], line: start });
        }
        continue;
      }
    }
    if (depth >= 0 && text === "{") interpolationBraces[depth]++;
    if (depth >= 0 && text === "}") interpolationBraces[depth]--;

    if (text === "/" && regexPrefix.test(tokens.at(-1)?.text ?? "=")) {
      regexLiteral.lastIndex = match.index;
      const literal = regexLiteral.exec(source);
      if (literal) {
        [text] = literal;
        lexeme.lastIndex = regexLiteral.lastIndex;
      }
    }
    if (!/^\s|^\/\/|^\/\*/.test(text)) tokens.push({ text, line });
    line += text.split("\n").length - 1;
  }
  return tokens;
}

function literalName(text: string | undefined): string {
  return text?.match(/^(['"`])([A-Za-z]+)\1$/)?.[2] ?? "";
}

function memberAt(tokens: readonly Token[], index: number): { name: string; next: number } | undefined {
  const accessor = tokens[index]?.text;
  if (accessor === "." || (accessor === "?." && tokens[index + 1]?.text !== "[")) {
    return { name: tokens[index + 1]?.text ?? "", next: index + 2 };
  }
  const bracket = accessor === "?." ? index + 1 : index;
  if (tokens[bracket]?.text === "[" && tokens[bracket + 2]?.text === "]") {
    return { name: literalName(tokens[bracket + 1]?.text), next: bracket + 3 };
  }
}

function isBareName(tokens: readonly Token[], index: number): boolean {
  return ![".", "?.", "#", "function"].includes(tokens[index - 1]?.text);
}

function rememberExitBindings(tokens: readonly Token[], processIndex: number, aliases: Set<string>): void {
  const end = processIndex - 2;
  if (tokens[processIndex - 1]?.text !== "=" || tokens[end]?.text !== "}") return;
  if ([".", "?.", "[", "("].includes(tokens[processIndex + 1]?.text)) return;
  let start = end - 1;
  while (start >= 0 && !["{", "}", ";"].includes(tokens[start].text)) start--;
  if (tokens[start]?.text !== "{" || !["const", "let", "var"].includes(tokens[start - 1]?.text)) return;

  for (let index = start + 1; index < end; index++) {
    if (tokens[index].text !== "exit" || !["{", ","].includes(tokens[index - 1].text)) continue;
    const alias = tokens[index + 1].text === ":" ? tokens[index + 2]?.text : "exit";
    if (alias && IDENTIFIER.test(alias)) aliases.add(alias);
  }
}

function callStart(tokens: readonly Token[], index: number): number | undefined {
  const open = tokens[index]?.text === "?." ? index + 1 : index;
  return tokens[open]?.text === "(" ? open : undefined;
}

function processRule(tokens: readonly Token[], index: number): Rule | undefined {
  const member = memberAt(tokens, index + 1);
  if (!member) return;
  const { name, next } = member;
  if (name === "exitCode") {
    const before = tokens[index - 1];
    const after = tokens[next];
    if (ASSIGNMENT.test(after?.text ?? "")
      || (before?.line === tokens[index].line && UPDATE.test(before.text))
      || (after?.line === tokens[next - 1].line && UPDATE.test(after.text))) return "exit-code-set";
  }

  const open = callStart(tokens, next);
  if (open === undefined) return;
  if (name === "exit" || name === "reallyExit") return "process-exit";
  if (name === "abort") return "process-abort";

  const argument = tokens[open + 1]?.text;
  if (name === "kill" && argument === "process") {
    const pid = memberAt(tokens, open + 2);
    if (pid?.name === "pid" && [")", ","].includes(tokens[pid.next]?.text)) return "process-kill-self";
  }
  if (ERROR_LISTENER_METHODS.has(name)) {
    if (name === "removeAllListeners" && argument === ")") return "error-event-takeover";
    if (ERROR_EVENTS.has(literalName(argument)) && [")", ","].includes(tokens[open + 2]?.text)) {
      return "error-event-takeover";
    }
  }
}

function inspectRun(path: string, added: readonly AddedLine[], findings: Finding[]): void {
  const tokens = tokenize(added.map(({ text }) => text).join("\n"), added[0].line);
  const aliases = new Set<string>();
  const rulesOnLine = new Set<Rule>();
  let previousLine = 0;

  for (const [index, { line, text }] of tokens.entries()) {
    if (!isBareName(tokens, index)) continue;
    let rule: Rule | undefined;
    if (text === "process") {
      rememberExitBindings(tokens, index, aliases);
      rule = processRule(tokens, index);
    } else if (aliases.has(text) && callStart(tokens, index + 1) !== undefined) {
      rule = "process-exit";
    }
    if (!rule) continue;
    if (previousLine !== line) rulesOnLine.clear();
    if (!rulesOnLine.has(rule)) findings.push({ path, line, rule });
    rulesOnLine.add(rule);
    previousLine = line;
  }
}

/** Check for direct process operations and destructured exit calls visible in consecutive added lines. */
export function forcedExit(files: unknown, allow: unknown = []): Finding[] {
  if (!Array.isArray(files)) return [];
  const allowedPaths = new Set(Array.isArray(allow) ? allow : []);
  const findings: Finding[] = [];

  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string" || !Array.isArray(file.added)) continue;
    const { path } = file;
    if (allowedPaths.has(path) || !POMELO_PATH.test(path)) continue;

    const added = file.added.filter(isAddedLine).sort((a, b) => a.line - b.line);
    for (let start = 0; start < added.length;) {
      let end = start + 1;
      while (end < added.length && added[end].line === added[end - 1].line + 1) end++;
      inspectRun(path, added.slice(start, end), findings);
      start = end;
    }
  }
  return findings.sort((a, b) => a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1);
}
