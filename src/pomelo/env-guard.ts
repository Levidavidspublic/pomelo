type ChangedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

type EnvRead = {
  path: string;
  line: number;
  name: string;
  reason: "not-allowed" | "whole-object" | "dynamic-name";
};

type Token = {
  kind: "word" | "literal" | "punctuation" | "opaque";
  value: string;
  offset: number;
  pair: number;
};

const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[^/]+$/;
const GROUP_END = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);
const EXPRESSION_PREFIX = new Set([
  "(", "[", "{", ";", ",", "=", "==", "===", "!=", "!==", "=>", ":", "?", "??",
  "!", "~", "+", "-", "*", "/", "%", "&", "|", "^", "&&", "||", "<", ">", "<=", ">=",
  "+=", "-=", "*=", "/=", "??=", "&&=", "||=", "...", "return", "throw", "case", "yield",
  "await", "typeof", "void", "delete", "in", "of", "else", "do", "instanceof",
]);
const CONTROL_HEAD = new Set(["if", "while", "for", "with", "switch", "catch"]);
const ESCAPED_CHARACTERS = new Map([
  ["b", "\b"], ["f", "\f"], ["n", "\n"], ["r", "\r"], ["t", "\t"], ["v", "\v"],
]);

function syntax(tokens: readonly Token[], index: number): string | undefined {
  const token = tokens[index];
  if (token?.kind === "word" || token?.kind === "punctuation") return token.value;
}

function startsExpression(tokens: readonly Token[], index: number): boolean {
  const prev = syntax(tokens, index - 1);
  if (index === 0 || (prev !== undefined && EXPRESSION_PREFIX.has(prev))) return true;
  if (prev !== ")") return false;
  const head = syntax(tokens, tokens[index - 1].pair - 1);
  return head !== undefined && CONTROL_HEAD.has(head);
}

function decodeEscapes(value: string): string {
  return value.replace(/\\(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|([0-7]{1,3})|(\r\n|[\s\S]))/g,
    (escape, codePoint, unicode, hex, octal, char) => {
      if (codePoint || unicode || hex) {
        const code = Number.parseInt(codePoint ?? unicode ?? hex, 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : escape;
      }
      if (octal) {
        const digits = octal[0] > "3" ? octal.slice(0, 2) : octal;
        return String.fromCharCode(Number.parseInt(digits, 8)) + octal.slice(digits.length);
      }
      if (/^[\r\n\u2028\u2029]/.test(char)) return "";
      return ESCAPED_CHARACTERS.get(char) ?? char;
    });
}

function numericKey(value: string): string | undefined {
  const digits = value.replace(/_/g, "");
  if (/^(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+)n$/.test(digits)) {
    return String(BigInt(digits.slice(0, -1)));
  }
  const number = Number(digits);
  if (!Number.isNaN(number)) return String(number);
}

function tokenize(source: string, jsx: boolean): Token[] {
  const tokens: Token[] = [];
  const openGroups: number[] = [];
  const word = /(?:[$_\p{ID_Start}]|\\u(?:\{[\da-fA-F]+\}|[\da-fA-F]{4}))(?:[$\u200c\u200d\p{ID_Continue}]|\\u(?:\{[\da-fA-F]+\}|[\da-fA-F]{4}))*/uy;
  const number = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)n?/y;
  const operator = /(?:===|!==|=>|==|!=|\.\.\.|\?\.|(?:\?\?|&&|\|\||\*\*|\+\+|--|[+*/%&|^-])=?|[<>]=)/y;
  const jsxTag = /<(?:>|[A-Za-z_$][\w$.:-]*(?=[\s/>])(?!\s+extends\b))/y;
  let cursor = 0;

  function emit(kind: Token["kind"], value: string, offset: number) {
    const token: Token = { kind, value, offset, pair: -1 };
    const index = tokens.push(token) - 1;
    if (kind !== "punctuation") return;
    const open = openGroups.at(-1);
    if (GROUP_END.has(value)) openGroups.push(index);
    else if (open !== undefined && GROUP_END.get(tokens[open].value) === value) {
      openGroups.pop();
      tokens[open].pair = index;
      token.pair = open;
    }
  }

  function quotedEnd(start: number, quote: string): number {
    let end = start + 1;
    while (end < source.length && source[end] !== quote) {
      if (source[end] === "\r" || source[end] === "\n") break;
      if (source[end] === "\\") end += source.startsWith("\r\n", end + 1) ? 2 : 1;
      end++;
    }
    return Math.min(end, source.length);
  }

  function regexEnd(start: number): number {
    let inClass = false;
    for (let i = start + 1; i < source.length && !/[\r\n\u2028\u2029]/.test(source[i]); i++) {
      const char = source[i];
      if (char === "\\") i++;
      else if (char === "[") inClass = true;
      else if (char === "]") inClass = false;
      else if (char === "/" && !inClass) {
        while (/[a-z]/i.test(source[i + 1] ?? "")) i++;
        return i + 1;
      }
    }
    return start;
  }

  // Keep the surrounding literal opaque, but tokenize its embedded JavaScript.
  function embeddedCode() {
    emit("punctuation", "{", cursor);
    cursor++;
    readCode(true);
    if (source[cursor] === "}") emit("punctuation", "}", cursor++);
  }

  function template() {
    const start = cursor++;
    let interpolated = false;
    while (cursor < source.length && source[cursor] !== "`") {
      if (source[cursor] === "\\") cursor += 2;
      else if (source.startsWith("\${", cursor)) {
        if (!interpolated) emit("opaque", "", start);
        interpolated = true;
        cursor++;
        embeddedCode();
      } else cursor++;
    }
    if (interpolated) emit("opaque", "", cursor);
    else if (cursor < source.length) {
      emit("literal", decodeEscapes(source.slice(start + 1, cursor).replace(/\r\n?/g, "\n")), start);
    } else emit("opaque", "", start);
    cursor++;
  }

  function markup() {
    emit("opaque", "", cursor);
    let depth = 0;
    do {
      if (source[cursor] === "<") {
        const closing = source[cursor + 1] === "/";
        cursor++;
        while (cursor < source.length && source[cursor] !== ">") {
          const char = source[cursor];
          if (char === "'" || char === '"') {
            const end = source.indexOf(char, cursor + 1);
            cursor = end === -1 ? source.length : end + 1;
          } else if (char === "{") embeddedCode();
          else cursor++;
        }
        if (closing) depth--;
        else if (source[cursor - 1] !== "/") depth++;
        cursor++;
      } else if (source[cursor] === "{") embeddedCode();
      else cursor++;
    } while (depth > 0 && cursor < source.length);
    emit("opaque", "", cursor - 1);
  }

  function readCode(embedded = false) {
    let braces = 0;
    while (cursor < source.length) {
      const start = cursor;
      const char = source[cursor];
      if (embedded && braces === 0 && char === "}") return;
      if (/\s/.test(char)) {
        cursor++;
      } else if (source.startsWith("//", cursor)) {
        while (cursor < source.length && !/[\r\n\u2028\u2029]/.test(source[cursor])) cursor++;
      } else if (source.startsWith("/*", cursor)) {
        const end = source.indexOf("*/", cursor + 2);
        cursor = end === -1 ? source.length : end + 2;
      } else if (char === "'" || char === '"') {
        const end = quotedEnd(cursor, char);
        if (source[end] === char) {
          emit("literal", decodeEscapes(source.slice(cursor + 1, end)), start);
          cursor = end + 1;
        } else {
          emit("opaque", "", start);
          cursor = end;
        }
      } else if (char === "`") {
        template();
      } else {
        word.lastIndex = number.lastIndex = operator.lastIndex = jsxTag.lastIndex = cursor;
        const identifier = word.exec(source);
        const numeric = identifier ? null : number.exec(source);
        if (identifier) {
          emit("word", decodeEscapes(identifier[0]), start);
          cursor = word.lastIndex;
        } else if (numeric) {
          const key = numericKey(numeric[0]);
          emit(key === undefined ? "opaque" : "literal", key ?? "", start);
          cursor = number.lastIndex;
        } else if (jsx && char === "<" && startsExpression(tokens, tokens.length) && jsxTag.test(source)) {
          markup();
        } else {
          const end = char === "/" && startsExpression(tokens, tokens.length) ? regexEnd(cursor) : cursor;
          if (end > cursor) {
            emit("opaque", "", start);
            cursor = end;
          } else {
            const punctuation = operator.exec(source)?.[0] ?? char;
            if (punctuation === "{") braces++;
            if (punctuation === "}") braces--;
            emit("punctuation", punctuation, start);
            cursor += punctuation.length;
          }
        }
      }
    }
  }

  readCode();
  return tokens;
}

function scan(source: string, path: string, allowedNames: ReadonlySet<string>) {
  const tokens = tokenize(source, /\.[jt]sx$/.test(path));
  const reads: (Pick<EnvRead, "name" | "reason"> & { offset: number })[] = [];
  const at = (index: number) => syntax(tokens, index);

  function report(index: number, name?: string, wholeObject = false) {
    if (!wholeObject && name !== undefined && allowedNames.has(name)) return;
    const reason = wholeObject ? "whole-object" : name === undefined ? "dynamic-name" : "not-allowed";
    reads.push({ offset: tokens[index].offset, name: name ?? "*", reason });
  }

  function staticKey(start: number, end: number): string | undefined {
    while (at(start) === "(" && tokens[start].pair === end - 1) {
      start++;
      end--;
    }
    if (end === start + 1 && tokens[start]?.kind === "literal") return tokens[start].value;
  }

  function member(end: number) {
    const next = at(end);
    const index = next === "." || next === "?." ? end + 1 : end;
    if (next !== "." && at(index) === "[") {
      const close = tokens[index].pair;
      const name = staticKey(index + 1, close);
      return { name, index: tokens[index + 1] ? index + 1 : index, end: close < 0 ? tokens.length : close + 1 };
    }
    if (index !== end && tokens[index]?.kind === "word") {
      return { name: tokens[index].value, index, end: index + 1 };
    }
  }

  function receiverStart(end: number): number {
    let start = end - 1;
    while (start > 0) {
      const last = at(start);
      if ((last === "]" || last === ")") && tokens[start].pair >= 0) {
        const open = tokens[start].pair;
        if (startsExpression(tokens, open)) return open;
        start = open - (at(open - 1) === "?." ? 2 : 1);
      } else if (at(start - 1) === "." || at(start - 1) === "?.") {
        start -= 2;
      } else break;
    }
    return Math.max(0, start);
  }

  function isTypeAssertion(start: number, end: number): boolean {
    if (at(start) !== "as" && at(start) !== "satisfies") return false;
    let depth = 0;
    for (let index = start + 1; index < end; index++) {
      const token = tokens[index];
      if (token.kind === "word" || token.kind === "literal") continue;
      switch (at(index)) {
        case "<": depth++; break;
        case ">": if (--depth < 0) return false; break;
        case ",": if (depth === 0) return false; break;
        case ".": case "[": case "]": case "|": case "&": break;
        default: return false;
      }
    }
    return start + 1 < end && depth === 0;
  }

  // Look through grouping and common TypeScript assertions around the receiver.
  function wrapped(start: number, end: number) {
    while (true) {
      if (at(end) === "!" && !source.slice(tokens[end - 1].offset, tokens[end].offset).includes("\n")) end++;
      else if (at(start - 1) === "(" && startsExpression(tokens, start - 1)) {
        const close = tokens[start - 1].pair;
        if (close === end || (close > end && isTypeAssertion(end, close))) {
          start--;
          end = close + 1;
        } else break;
      } else break;
    }
    return { start, end };
  }

  function writeOnly(start: number, end: number): boolean {
    if (at(end) === "=") return true;
    return at(start - 1) === "delete" && ![".", "?.", "[", "(", "++", "--"].includes(at(end) ?? "");
  }

  function* patternKeys(open: number) {
    const close = tokens[open].pair;
    for (let index = open + 1; index < close;) {
      const token = tokens[index];
      const key = at(index);
      const rest = key === "...";
      const name = key === "[" ? staticKey(index + 1, token.pair)
        : token.kind === "word" || token.kind === "literal" ? token.value : undefined;
      yield { index, name, rest };
      do {
        const pair = tokens[index].pair;
        index = pair > index ? pair + 1 : index + 1;
      } while (index < close && at(index) !== ",");
      index++;
    }
  }

  function bindingBefore(start: number): number | undefined {
    if (at(start - 1) !== "=") return;
    for (let index = start - 2; index >= 0; index--) {
      const value = at(index);
      const pair = tokens[index].pair;
      if (value === "}" && pair >= 0 && (index === start - 2 || at(index + 1) === ":")
          && ["const", "let", "var", "(", ","].includes(at(pair - 1) ?? "")) return pair;
      if (value === ";" || value === "=" || value === "(" || value === "{") return;
      if (pair >= 0 && pair < index) index = pair;
    }
  }

  function environment(start: number, end: number) {
    const env = wrapped(start, end);
    if (writeOnly(env.start, env.end)) return;
    const key = member(env.end);
    if (key) {
      const access = wrapped(env.start, key.end);
      if (!writeOnly(access.start, access.end)) report(key.index, key.name);
    } else {
      const binding = bindingBefore(env.start);
      if (binding === undefined) report(start, undefined, true);
      else for (const key of patternKeys(binding)) report(key.index, key.name, key.rest);
    }
  }

  for (let index = 0; index < tokens.length; index++) {
    if (at(index) === "import") {
      const meta = member(index + 1);
      if (meta?.name === "meta") {
        const base = wrapped(index, meta.end);
        const env = member(base.end);
        if (env?.name === "env") environment(base.start, env.end);
        continue;
      }

      // Named imports can bind the environment object without a member expression.
      const open = at(index + 1) === "{" ? index + 1 : at(index + 2) === "," ? index + 3 : -1;
      if (at(open) !== "{") continue;
      const close = tokens[open].pair;
      const moduleName = staticKey(close + 2, close + 3);
      if (close < 0 || at(close + 1) !== "from" || (moduleName !== "node:process" && moduleName !== "process")) continue;
      for (const key of patternKeys(open)) {
        if (key.name === "env") report(key.index, undefined, true);
      }
    } else {
      let start = index;
      let end = index + 1;
      // A qualified receiver can still point to Node's process object.
      if (at(index) === "process") start = receiverStart(end);
      else if (at(index) === "[" && staticKey(index + 1, tokens[index].pair) === "process"
          && index > 0 && !startsExpression(tokens, index)) {
        start = receiverStart(index - (at(index - 1) === "?." ? 1 : 0));
        end = tokens[index].pair + 1;
      } else continue;

      const processExpression = wrapped(start, end);
      const env = member(processExpression.end);
      if (env?.name === "env") {
        environment(processExpression.start, env.end);
      } else if (!env) {
        const binding = bindingBefore(processExpression.start);
        if (binding === undefined) continue;
        for (const key of patternKeys(binding)) {
          if (key.name === "env") report(key.index, undefined, true);
        }
      }
    }
  }
  return reads.sort((a, b) => a.offset - b.offset);
}

/** Report environment reads visible in the added lines. A custom allowlist replaces the defaults. */
export function findEnvReads(
  files: readonly ChangedFile[],
  options: { allowedNames?: readonly string[] } = {},
): { ok: boolean; hits: EnvRead[] } {
  const allowedNames = new Set(options.allowedNames ?? ["FRIDAY_HOME", "NODE_ENV"]);
  const hits: EnvRead[] = [];

  for (const { path, added } of files) {
    if (!path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) continue;
    if (TEST_PATH.test(path)) continue;

    const lines = [...added].sort((a, b) => a.line - b.line);
    // Parse adjacent additions together but never join code across unknown source lines.
    for (let start = 0; start < lines.length;) {
      let end = start + 1;
      while (end < lines.length && lines[end].line === lines[end - 1].line + 1) end++;

      const source = lines.slice(start, end).map(({ text }) => text).join("\n");
      let index = start;
      let lineEnd = lines[index].text.length;
      for (const { offset, name, reason } of scan(source, path, allowedNames)) {
        while (offset > lineEnd) lineEnd += lines[++index].text.length + 1;
        hits.push({ path, line: lines[index].line, name, reason });
      }
      start = end;
    }
  }

  return { ok: hits.length === 0, hits };
}
