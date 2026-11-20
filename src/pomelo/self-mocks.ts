import type { AddedLine } from "./e2e-mocks.js";

const reasons = {
  module: "The test replaces a Pomelo module with a fake.",
  method: "The test mocks a method on an object imported from Pomelo.",
  "module-mocks-flag": "This flag enables tests to replace whole modules.",
};

export interface SelfMockFinding {
  path: string;
  line: number;
  kind: keyof typeof reasons;
  reason: string;
}

const pomeloTest = /^test\/pomelo-[^/\r\n]*\.test\.ts$/;
const pomeloImport = /(?:^|\/)src\/(?:client\/)?pomelo\/|^@\/pomelo\//;
const moduleMocksFlag = "--experimental-test-module-mocks";
const identifier = /^[$_\p{ID_Start}][$\p{ID_Continue}\u200c\u200d]*$/u;
const sourceToken = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[^\r\n]|[^"\\\r\n])*"?|'(?:\\[^\r\n]|[^'\\\r\n])*'?|`(?:\\[\s\S]|[^`\\])*`?|[$_\p{ID_Start}][$\p{ID_Continue}\u200c\u200d]*|./gu;

interface Token {
  value: string;
  line: number;
}

function isAddedLine(value: unknown): value is AddedLine {
  if (value === null || typeof value !== "object") return false;
  const { path, line, text } = value as Partial<AddedLine>;
  return typeof path === "string" && typeof text === "string"
    && typeof line === "number" && Number.isSafeInteger(line) && line > 0;
}

// Keep a line number on each token so that a call split across added lines is reported where it starts.
function tokenize(lines: AddedLine[]): Token[] {
  const source = lines.map(({ text }) => text).join("\n");
  const tokens: Token[] = [];
  let index = 0;
  let lineEnd = lines[0].text.length;
  for (const { 0: value, index: offset } of source.matchAll(sourceToken)) {
    if (/^\s/.test(value) || value.startsWith("//") || value.startsWith("/*")) continue;
    while (offset > lineEnd) lineEnd += lines[++index].text.length + 1;
    tokens.push({ value, line: lines[index].line });
  }
  return tokens;
}

function literalPath(value: string): string {
  const quote = value[0];
  if (value.length < 2 || !value.endsWith(quote)) return "";
  if (quote === "'" || quote === '"' || (quote === "`" && !value.includes("${"))) return value.slice(1, -1);
  return "";
}

function importBindings(tokens: Token[], start: number): string[] {
  const at = (index: number) => tokens[index]?.value ?? "";
  let index = start;
  const bindings: string[] = [];
  if (at(index) === "type" && at(index + 1) !== "from" && at(index + 1) !== ",") return [];

  if (identifier.test(at(index))) {
    bindings.push(at(index++));
    if (at(index) === ",") index++;
  }

  if (at(index) === "*" && at(index + 1) === "as" && identifier.test(at(index + 2))) {
    bindings.push(at(index + 2));
    index += 3;
  } else if (at(index) === "{") {
    index++;
    while (at(index) !== "}") {
      const typeOnly = at(index) === "type" && identifier.test(at(index + 1)) && at(index + 1) !== "as";
      if (typeOnly) index++;
      let binding = at(index++);
      if (at(index) === "as") {
        binding = at(index + 1);
        index += 2;
      }
      if (!identifier.test(binding)) return [];
      if (!typeOnly) bindings.push(binding);
      if (at(index) !== ",") break;
      index++;
    }
    if (at(index++) !== "}") return [];
  }

  return at(index) === "from" && pomeloImport.test(literalPath(at(index + 1))) ? bindings : [];
}

function inspectFile(lines: AddedLine[]): SelfMockFinding[] {
  lines.sort((a, b) => a.line - b.line);
  const path = lines[0].path;
  const findings = new Map<string, SelfMockFinding>();
  const report = (line: number, kind: SelfMockFinding["kind"]) => {
    findings.set(`${line}:${kind}`, { path, line, kind, reason: reasons[kind] });
  };

  for (const { line, text } of lines) {
    if (text.includes(moduleMocksFlag)) report(line, "module-mocks-flag");
  }

  // Imports can be elsewhere in the same file. Individual statements can only span consecutive added lines.
  const chunks: Token[][] = [];
  let start = 0;
  for (let end = 1; end <= lines.length; end++) {
    if (lines[end]?.line === lines[end - 1].line + 1) continue;
    chunks.push(tokenize(lines.slice(start, end)));
    start = end;
  }

  const imported = new Set<string>();
  for (const tokens of chunks) {
    for (const [index, { value }] of tokens.entries()) {
      if (value !== "import" || tokens[index - 1]?.value === ".") continue;
      for (const name of importBindings(tokens, index + 1)) imported.add(name);
    }
  }

  for (const tokens of chunks) {
    for (const [index, { value, line }] of tokens.entries()) {
      const previous = tokens[index - 1]?.value;
      if (previous === "." || previous === "#") continue;
      const mock = value === "t" && tokens[index + 1]?.value === "." ? index + 2 : index;
      if (tokens[mock]?.value !== "mock" || tokens[mock + 1]?.value !== "." || tokens[mock + 3]?.value !== "(") continue;
      const kind = tokens[mock + 2]?.value;
      const target = tokens[mock + 4]?.value ?? "";
      const next = tokens[mock + 5]?.value;
      if (next !== "," && next !== ")") continue;
      if (kind === "module" && literalPath(target).includes("/pomelo/")) report(line, kind);
      if (kind === "method" && imported.has(target)) report(line, kind);
    }
  }

  return [...findings.values()].sort((a, b) => a.line - b.line);
}

/** Report direct self-mocks visible in the added lines of each Pomelo test. */
export function selfMockLines(added: AddedLine[]): SelfMockFinding[] {
  if (!Array.isArray(added)) return [];
  const files = new Map<string, AddedLine[]>();
  for (const value of added) {
    if (!isAddedLine(value) || !pomeloTest.test(value.path.replaceAll("\\", "/"))) continue;
    const lines = files.get(value.path);
    if (lines) lines.push(value);
    else files.set(value.path, [value]);
  }
  return [...files.keys()].sort().flatMap((path) => inspectFile(files.get(path)!));
}
