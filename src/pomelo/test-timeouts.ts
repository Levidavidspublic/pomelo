export type TestTimeoutFinding = {
  file: string;
  line: number;
  kind: "over-cap" | "disabled" | "unclear" | "flag";
  reason: string;
};

export type TestTimeoutOptions = { maxTimeoutMs?: number };
export type TestTimeoutResult = { ok: boolean; findings: TestTimeoutFinding[]; reason?: string };

type SourceLine = { text: string; line: number; added: boolean };
type Token = { text: string; row: number };

const pomeloTest = /^test\/pomelo-[^/\r\n]*\.test\.ts$/;
const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/;
const gitMetadata = /^(?:index |old mode |new mode |(?:new|deleted) file mode |(?:dis)?similarity index |(?:rename|copy) (?:from|to) |Binary files .+ differ$)/;
const gitFileChange = /^(?:new mode |(?:rename|copy) to |Binary files )/;
const noNewline = "\\ No newline at end of file";

const digits = String.raw`\d(?:_?\d)*`;
const basedNumber = /0(?:[xX][\da-fA-F](?:_?[\da-fA-F])*|[oO][0-7](?:_?[0-7])*|[bB][01](?:_?[01])*)/;
const decimal = String.raw`(?:${digits}(?:\.(?:${digits})?)?|\.${digits})(?:[eE][+-]?${digits})?`;
const number = new RegExp(`${basedNumber.source}|${decimal}`);
const numberLiteral = new RegExp(`^(?:${number.source})$`);
const comments = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/;
const strings = /"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?/;
const word = /[$_\p{ID_Start}][$\p{ID_Continue}\u200c\u200d]*/u;
const regexPredecessor = /^(?:[=(:,;!&|?{\[]|=>|return|throw|yield|case)$/;
const timeoutKey = /^(?:timeout|"timeout"|'timeout')$/;
const flag = /(?:^|[\s;&|"'`])--test-timeout(?=$|[=\s;&|"'`])/g;
const nodeCommand = /^\s*(?:[^\s"'`]*\/)?(?:node|npm|npx|tsx|bun|pnpm|yarn)(?:\.exe)?\s/;
const spawnCall = /^(?:exec|execFile|spawn)(?:Sync)?$/;

function destination(header: string): string {
  const path = header.slice(4).split("\t", 1)[0];
  // Git quotes paths with non-ASCII characters and writes their UTF-8 bytes in octal.
  const decoded = path.startsWith('"') && path.endsWith('"')
    ? Buffer.from(path.slice(1, -1).replace(/\\([0-3][0-7]{2}|.)/g, (_, escape: string) => {
      if (escape.length === 3) return String.fromCharCode(parseInt(escape, 8));
      return ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[escape] ?? escape;
    }), "latin1").toString("utf8")
    : path;
  return decoded.replace(/^b\//, "");
}

function scanTokens(source: string): Token[] {
  const pattern = new RegExp([comments, strings, number, word, /=>|\*\*|\s+|./].map((part) => part.source).join("|"), "suy");
  const regexLiteral = /\/(?:\\[^\n]|[^/\\[\n]|\[(?:\\[^\n]|[^\]\\\n])*\])+\/[dgimsuvy]*/y;
  const tokens: Token[] = [];
  let row = 0;
  for (let offset = 0; offset < source.length;) {
    pattern.lastIndex = offset;
    const [text] = pattern.exec(source)!;
    const previous = tokens.at(-1)?.text;
    if (text === "/" && (previous === undefined || regexPredecessor.test(previous))) {
      regexLiteral.lastIndex = offset;
      if (regexLiteral.test(source)) {
        offset = regexLiteral.lastIndex;
        tokens.push({ text: "<regex>", row });
        continue;
      }
    }
    offset = pattern.lastIndex;
    if (!/^(?:\s|\/[/\*])/.test(text)) tokens.push({ text, row });
    for (const _ of text.matchAll(/\n/g)) row++;
  }
  return tokens;
}

function timeoutValue(tokens: Token[], start: number): Token[] {
  let depth = 0;
  let end = start;
  for (; end < tokens.length; end++) {
    const { text } = tokens[end];
    if (depth === 0 && /^[,;)}\]]$/.test(text)) break;
    if (/^[({\[]$/.test(text)) depth++;
    if (/^[)}\]]$/.test(text)) depth--;
  }
  return tokens.slice(start, end);
}

function milliseconds(value: Token[]): number | undefined {
  const expression = value.map(({ text }) => text).join(" ");
  if (expression === "Infinity") return Infinity;
  if (expression === "Number . MAX_SAFE_INTEGER") return Number.MAX_SAFE_INTEGER;

  let product = 1;
  for (const factor of expression.split("*")) {
    const literal = factor.trim();
    if (!numberLiteral.test(literal)) return undefined;
    product *= Number(literal.replaceAll("_", ""));
  }
  return Number.isNaN(product) ? undefined : product;
}

function checkHunk(file: string, lines: SourceLine[], maxTimeoutMs: number): TestTimeoutFinding[] {
  const tokens = scanTokens(lines.map(({ text }) => text).join("\n"));
  const findings: TestTimeoutFinding[] = [];
  const seen = new Set<string>();
  function report(row: number, kind: TestTimeoutFinding["kind"], reason: string) {
    const source = lines[row];
    const key = `${row}:${kind}`;
    if (!source?.added || seen.has(key)) return;
    seen.add(key);
    findings.push({ file, line: source.line, kind, reason });
  }

  for (const [index, token] of tokens.entries()) {
    const previous = tokens[index - 1]?.text;
    // The call that consumes an options object can lie outside the diff hunk.
    if (timeoutKey.test(token.text) && tokens[index + 1]?.text === ":" &&
        (previous === undefined || previous === "{" || previous === ",")) {
      const value = timeoutValue(tokens, index + 2);
      const changed = [token, tokens[index + 1], ...value].find(({ row }) => lines[row].added);
      if (!changed) continue;
      const ms = milliseconds(value);
      if (ms === undefined) {
        report(changed.row, "unclear", "Review this test timeout because its value could not be determined.");
      } else if (ms === 0 || ms === Infinity || ms === Number.MAX_SAFE_INTEGER) {
        report(changed.row, "disabled", "This timeout value disables or effectively removes the test time limit.");
      } else if (ms > maxTimeoutMs) {
        report(changed.row, "over-cap", `The test timeout of ${ms} ms exceeds the ${maxTimeoutMs} ms cap.`);
      }
    }

    if (!/^["'`]/.test(token.text)) continue;
    const literal = token.text.slice(1, -1);
    const spawned = previous === "(" && spawnCall.test(tokens[index - 2]?.text ?? "");
    if (!spawned && !nodeCommand.test(literal) && !literal.startsWith("--test-timeout")) continue;
    for (const match of literal.matchAll(flag)) {
      const beforeFlag = literal.slice(0, match.index + match[0].length);
      const row = token.row + (beforeFlag.match(/\n/g)?.length ?? 0);
      report(row, "flag", "The --test-timeout flag overrides the test runner's time limit.");
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

/** Check added lines in top-level Pomelo tests using only the supplied unified diff. */
export function testTimeouts(diffText: string, { maxTimeoutMs = 30_000 }: TestTimeoutOptions = {}): TestTimeoutResult {
  const invalid = { ok: false, findings: [], reason: "Could not parse the unified diff." };
  const findings: TestTimeoutFinding[] = [];
  if (!diffText.trim()) return { ok: true, findings };

  const rows = diffText.split(/\r?\n/);
  let file: string | undefined;
  let gitHeader = false;
  let complete = true;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row === "") continue;
    if (/^diff --git .+ .+$/.test(row)) {
      if (!complete) return invalid;
      gitHeader = true;
      complete = false;
      file = undefined;
      continue;
    }
    if (gitHeader && file === undefined && gitMetadata.test(row)) {
      complete ||= gitFileChange.test(row);
      continue;
    }
    if (row.startsWith("--- ") && row.length > 4 && /^\+\+\+ .+/.test(rows[index + 1] ?? "")) {
      if (file !== undefined && !complete) return invalid;
      file = destination(rows[++index]);
      complete = false;
      continue;
    }
    const hunk = hunkHeader.exec(row);
    if (!file || !hunk) return invalid;

    const oldStart = Number(hunk[1]);
    let oldLeft = Number(hunk[2] ?? 1);
    let line = Number(hunk[3]);
    let newLeft = Number(hunk[4] ?? 1);
    if (![oldStart + oldLeft, line + newLeft].every(Number.isSafeInteger) ||
        (oldStart === 0 && oldLeft !== 0) || (line === 0 && newLeft !== 0) ||
        (oldLeft === 0 && newLeft === 0)) return invalid;

    const lines: SourceLine[] = [];
    const inspect = pomeloTest.test(file);
    while (oldLeft > 0 || newLeft > 0) {
      const content = rows[++index];
      const prefix = content?.[0];
      if (prefix !== " " && prefix !== "+" && prefix !== "-") return invalid;
      if (prefix !== "+") oldLeft--;
      if (prefix !== "-") {
        if (inspect) lines.push({ text: content.slice(1), line, added: prefix === "+" });
        newLeft--;
        line++;
      }
      if (oldLeft < 0 || newLeft < 0) return invalid;
      if (rows[index + 1] === noNewline) index++;
    }
    if (lines.some(({ added }) => added)) findings.push(...checkHunk(file, lines, maxTimeoutMs));
    complete = true;
  }

  return complete ? { ok: findings.length === 0, findings } : invalid;
}
