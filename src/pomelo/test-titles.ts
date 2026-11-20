export type TestTitleFinding = {
  file: string;
  line: number;
  kind: "empty" | "dynamic" | "repeated";
  message: string;
};

export type TestTitleResult =
  | { ok: true; findings: TestTitleFinding[] }
  | { ok: false; reason: string };

type Token = { text: string; line: number; title?: string };
type TitleCounts = Map<string, number>;

const pomeloTest = /^test\/pomelo-[^/\\\r\n]*\.test\.ts$/;
const opening = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);
const modifiers = new Set(["skip", "only", "todo"]);
const regexPrefix = /^(?:[=(:,;!&|?~+*%^{\[]|=>|return|throw|case|typeof|void|yield)$/;
const escapes = new Map([
  ["b", "\b"], ["f", "\f"], ["n", "\n"], ["r", "\r"], ["t", "\t"], ["v", "\v"], ["0", "\0"],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeTitle(content: string): string | undefined {
  let valid = true;
  const title = content.replace(/\r\n?/g, "\n").replace(
    /\\(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|([\s\S]))/g,
    (_, point: string, unicode: string, hex: string, escaped: string, offset: number, source: string) => {
      if (point || unicode || hex) {
        const value = Number.parseInt(point ?? unicode ?? hex, 16);
        if (value <= 0x10ffff) return String.fromCodePoint(value);
        valid = false;
      } else if (/[1-9ux]/.test(escaped) || (escaped === "0" && /\d/.test(source[offset + 2] ?? ""))) {
        valid = false;
      }
      if (/^[\n\u2028\u2029]$/.test(escaped)) return "";
      return escapes.get(escaped) ?? escaped;
    },
  );
  return valid ? title : undefined;
}

function regexEnd(source: string, start: number): number {
  let inClass = false;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (/[\r\n\u2028\u2029]/.test(char)) break;
    if (char === "\\") index++;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) return index + 1;
  }
  return start + 1;
}

// Keep literals opaque, including nested templates inside an interpolation.
function tokenize(source: string): Token[] | undefined {
  const code = /\s+|\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?\*\/|"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*'|[$_\p{ID_Start}][$\p{ID_Continue}\u200c\u200d]*|=>|\?\.|\/\*|[\s\S]/uy;
  const template = /(?:\\[\s\S]|[^\\\x60$]|\$(?!\{))*(\x60|\$\{)/y;
  const tokens: Token[] = [];
  const templates: number[] = [];
  let templateStart = 0;
  let templateLine = 0;
  let interpolated = false;
  let previous = "=";
  let line = 1;
  let offset = 0;

  while (offset < source.length) {
    const mode = templates.at(-1);
    const pattern = mode === 0 ? template : code;
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) return;
    let [text, boundary] = match;
    if (mode === 0) {
      if (boundary === "\x60") {
        templates.pop();
        if (!templates.length) {
          const title = interpolated ? undefined : decodeTitle(source.slice(templateStart + 1, pattern.lastIndex - 1));
          // A tagged template can contain escapes that have no cooked string value.
          tokens.push({ text: "\x60", line: templateLine, title });
        }
        previous = "\x60";
      } else {
        templates[templates.length - 1] = 1;
        interpolated = true;
        previous = "{";
      }
    } else if (text === "/*" || text === '"' || text === "'") {
      return;
    } else if (text === "\x60") {
      if (mode === undefined) {
        templateStart = offset;
        templateLine = line;
        interpolated = false;
      }
      templates.push(0);
    } else if (!/^\s|^\/[/*]/.test(text)) {
      if (text === "/" && regexPrefix.test(previous)) {
        pattern.lastIndex = regexEnd(source, offset);
        text = source.slice(offset, pattern.lastIndex);
      }
      if (mode !== undefined) {
        if (text === "{") templates[templates.length - 1]++;
        if (text === "}") templates[templates.length - 1]--;
      } else if (/^["']/.test(text)) {
        const title = decodeTitle(text.slice(1, -1));
        if (title === undefined) return;
        tokens.push({ text, line, title });
      } else {
        tokens.push({ text, line });
      }
      previous = text;
    }
    line += text.split("\n").length - 1;
    offset = pattern.lastIndex;
  }
  if (!templates.length) return tokens;
}

function delimiterPairs(tokens: Token[]): Map<number, number> | undefined {
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (const [index, { text }] of tokens.entries()) {
    if (opening.has(text)) {
      stack.push(index);
    } else if (text === ")" || text === "]" || text === "}") {
      const start = stack.pop();
      if (start === undefined || opening.get(tokens[start].text) !== text) return;
      pairs.set(start, index);
      pairs.set(index, start);
    }
  }
  if (!stack.length) return pairs;
}

function argumentEnd(tokens: Token[], pairs: Map<number, number>, start: number, close: number): number {
  while (start < close && tokens[start].text !== ",") start = (pairs.get(start) ?? start) + 1;
  return start;
}

function unwrapArgument(tokens: Token[], pairs: Map<number, number>, start: number, end: number) {
  while (tokens[start].text === "(" && pairs.get(start) === end - 1) {
    start++;
    end--;
  }
  return { start, end };
}

function describeBody(tokens: Token[], pairs: Map<number, number>, open: number, close: number) {
  for (let argument = open + 1; argument < close;) {
    const separator = argumentEnd(tokens, pairs, argument, close);
    if (separator < close - 1) {
      argument = separator + 1;
      continue;
    }
    const { start, end } = unwrapArgument(tokens, pairs, argument, separator);
    const body = tokens[end - 1].text === "}" ? pairs.get(end - 1) : undefined;
    if (body === undefined) return;
    const first = tokens[start].text === "async" ? start + 1 : start;
    if (tokens[body - 1].text === "=>" || tokens[first].text === "function") return body;
    return;
  }
}

function inspectFile(file: string, tokens: Token[], pairs: Map<number, number>, added: Set<number>): TestTitleFinding[] {
  const suiteBodies = new Set<number>();
  const scopes: { close: number; counts: TitleCounts }[] = [{ close: tokens.length, counts: new Map() }];
  const calls: { line: number; title: string | undefined; counts: TitleCounts }[] = [];

  for (const [index, { text, line }] of tokens.entries()) {
    // A suite's scope lasts until its callback brace closes.
    if (index === scopes.at(-1)?.close) scopes.pop();
    if (suiteBodies.has(index)) scopes.push({ close: pairs.get(index)!, counts: new Map() });
    if (text !== "test" && text !== "it" && text !== "describe") continue;
    const previous = tokens[index - 1]?.text;
    if (previous === "." || previous === "?." || previous === "#" || previous === "function" || previous === "new") continue;

    let open = index + 1;
    if (tokens[open]?.text === "." && modifiers.has(tokens[open + 1]?.text)) open += 2;
    if (tokens[open]?.text !== "(") continue;
    const close = pairs.get(open)!;
    const next = tokens[close + 1];
    if (next?.text === "{" && next.line === tokens[close].line) continue; // Method declaration.
    if (text === "describe") {
      const body = describeBody(tokens, pairs, open, close);
      if (body !== undefined) suiteBodies.add(body);
      continue;
    }

    const { start, end } = unwrapArgument(tokens, pairs, open + 1, argumentEnd(tokens, pairs, open + 1, close));
    const title = start === close ? "" : end === start + 1 ? tokens[start].title : undefined;
    const counts = scopes.at(-1)!.counts;
    if (title !== undefined) counts.set(title, (counts.get(title) ?? 0) + 1);
    if (added.has(line)) calls.push({ line, title, counts });
  }

  const findings: TestTitleFinding[] = [];
  for (const { line, title, counts } of calls) {
    if (title === undefined) {
      findings.push({ file, line, kind: "dynamic", message: "Test title is built at run time on line " + line + "." });
    } else if (!title.trim()) {
      findings.push({ file, line, kind: "empty", message: "Test title is empty on line " + line + "." });
    } else if ((counts.get(title) ?? 0) > 1) {
      const display = JSON.stringify([...title].slice(0, 60).join(""));
      findings.push({ file, line, kind: "repeated", message: "Test title " + display + " is repeated on line " + line + "." });
    }
  }
  return findings;
}

/** Inspect added call lines against the corresponding full post-change file text. */
export function testTitleFindings(input: unknown): TestTitleResult {
  if (!Array.isArray(input)) return { ok: false, reason: "Expected a list of changed files." };

  const findings: TestTitleFinding[] = [];
  for (const file of input) {
    if (!isRecord(file) || typeof file.path !== "string" || !file.path) {
      return { ok: false, reason: "Expected a path for each changed file." };
    }
    const { path, fullText, addedLines } = file;
    if (!pomeloTest.test(path)) continue;
    if (typeof fullText !== "string" || !Array.isArray(addedLines)) {
      return { ok: false, reason: "Expected full file text and added lines for each Pomelo test file." };
    }
    const lines = fullText.split(/\r?\n/);
    if (!fullText || fullText.endsWith("\n")) lines.pop();
    const added = new Set<number>();
    for (const entry of addedLines) {
      if (!isRecord(entry) || typeof entry.line !== "number" || !Number.isSafeInteger(entry.line)
        || entry.line < 1 || typeof entry.text !== "string" || entry.text.replace(/\r$/, "") !== lines[entry.line - 1]) {
        return { ok: false, reason: "An added line does not match the full Pomelo test file text." };
      }
      added.add(entry.line);
    }

    const tokens = tokenize(fullText);
    const pairs = tokens && delimiterPairs(tokens);
    if (!tokens || !pairs) return { ok: false, reason: "Could not read the Pomelo test file structure." };
    for (const finding of inspectFile(path, tokens, pairs, added)) findings.push(finding);
  }
  findings.sort((a, b) => a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1);
  return { ok: true, findings };
}
