export interface TestReachFile {
  readonly path: string;
  readonly status: string;
  readonly text: string;
}

export interface TestReachFinding {
  path: string;
  reason: string;
}

export interface TestReachResult {
  ok: boolean;
  unreached: TestReachFinding[];
  problems: string[];
}

const pomeloSource = /^src\/(?:client\/)?pomelo\/.+\.tsx?$/;
const testFile = /^test\/.+\.test\.ts$/;
const identifier = /^[\p{ID_Start}_$]/u;
const regexPrefix = /^(?:[=(:,;!&|?~+*%^{\[\x60]|=>|return|throw|case|typeof|void|yield)$/;

function codeTokens(source: string): string[] {
  const lexeme = /\s+|\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*'|[\p{ID_Continue}$\u200c\u200d]+|\?\.|=>|./suy;
  const regexLiteral = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/y;
  const templatePart = /(?:\\[\s\S]|[^`\\$]|\$(?!\{))*(`|\$\{|$)/y;
  const tokens: string[] = [];
  let offset = source.match(/^#![^\r\n]*/)?.[0].length ?? 0;

  function scanTemplate(start: number): void {
    let interpolated = false;
    while (offset < source.length) {
      templatePart.lastIndex = offset;
      const part = templatePart.exec(source);
      if (!part) break;
      offset = templatePart.lastIndex;
      if (part[1] === "`" && !interpolated) {
        tokens.push(source.slice(start, offset));
        return;
      }
      // Keep the template body opaque while scanning code inside each interpolation.
      tokens.push("`");
      if (part[1] !== "${") return;
      interpolated = true;
      scanCode(true);
    }
  }

  function scanCode(interpolation = false): void {
    let braces = 0;
    while (offset < source.length) {
      lexeme.lastIndex = offset;
      const match = lexeme.exec(source);
      if (!match) return;
      const [token] = match;
      offset = lexeme.lastIndex;
      if (/^\s|^\/\/|^\/\*/.test(token)) continue;
      if (interpolation && token === "}" && braces === 0) return;
      if (token === "{") braces++;
      if (token === "}") braces--;
      if (token === "`") {
        scanTemplate(match.index);
        continue;
      }
      if (token === "/" && regexPrefix.test(tokens.at(-1) ?? "=")) {
        regexLiteral.lastIndex = match.index;
        if (regexLiteral.test(source)) {
          offset = regexLiteral.lastIndex;
          tokens.push("/");
          continue;
        }
      }
      tokens.push(token);
    }
  }

  scanCode();
  return tokens;
}

function literalPath(token: string | undefined, allowTemplate = false): string | undefined {
  if (!token || token.length < 2) return;
  const quote = token[0];
  if (quote !== '"' && quote !== "'" && !(allowTemplate && quote === "`")) return;
  // Interpret string escapes without evaluating any of the test code.
  const escapedCharacters: Record<string, string> = {
    b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "0": "\0",
  };
  return token.slice(1, -1).replace(
    /\\(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|(\r\n|[\s\S]))/g,
    (escape: string, point?: string, unit?: string, byte?: string, character?: string) => {
      const hex = point ?? unit ?? byte;
      if (hex !== undefined) {
        const code = Number.parseInt(hex, 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : escape;
      }
      if (!character || /^[\r\n\u2028\u2029]/.test(character)) return "";
      return escapedCharacters[character] ?? character;
    },
  );
}

function fromPath(tokens: readonly string[], start: number, importing: boolean): string | undefined {
  let index = start;
  if (importing && identifier.test(tokens[index] ?? "")) {
    if (tokens[index] === "type" && !["from", ","].includes(tokens[index + 1])) return;
    index++;
    if (tokens[index] !== ",") {
      return tokens[index] === "from" ? literalPath(tokens[index + 1]) : undefined;
    }
    index++;
  }

  if (tokens[index] === "*") {
    index += tokens[index + 1] === "as" ? 3 : 1;
  } else if (tokens[index] === "{") {
    index++;
    let hasValue = tokens[index] === "}";
    while (index < tokens.length && tokens[index] !== "}") {
      const binding = index;
      while (index < tokens.length && ![",", "}"].includes(tokens[index])) index++;
      const length = index - binding;
      // "type as local" imports a value named "type".
      const typeOnly = tokens[binding] === "type" && length > 1
        && !(length === 3 && tokens[binding + 1] === "as");
      hasValue ||= !typeOnly;
      if (tokens[index] === ",") index++;
    }
    if (!hasValue || tokens[index] !== "}") return;
    index++;
  } else {
    return;
  }
  if (tokens[index] === "from") return literalPath(tokens[index + 1]);
}

function* importedPaths(source: string): Iterable<string> {
  const tokens = codeTokens(source);
  for (const [index, token] of tokens.entries()) {
    if (token !== "import" && token !== "export") continue;
    if (tokens[index - 1] === "." || tokens[index - 1] === "?.") continue;
    let specifier: string | undefined;
    if (token === "import" && tokens[index + 1] === "(") {
      // A direct import query in a type alias is erased by TypeScript.
      const expression = tokens[index - 1] === "typeof" ? index - 1 : index;
      if (tokens[expression - 1] === "=" && tokens[expression - 3] === "type") continue;
      if (tokens[index + 3] === ")" || tokens[index + 3] === ",") {
        specifier = literalPath(tokens[index + 2], true);
      }
    } else {
      specifier = token === "import" ? literalPath(tokens[index + 1]) : undefined;
      specifier ??= fromPath(tokens, index + 1, token === "import");
    }
    if (specifier !== undefined) yield specifier;
  }
}

function normalize(path: string): string | undefined {
  if (path.startsWith("/")) return;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") {
      if (parts.pop() === undefined) return;
    } else if (part && part !== ".") {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function reachedSource(testPath: string, specifier: string, sources: ReadonlySet<string>): string | undefined {
  if (!/^\.\.?\//.test(specifier) || /[\\?#]|\/\.{0,2}$/.test(specifier)) return;
  const directory = testPath.slice(0, testPath.lastIndexOf("/") + 1);
  const target = normalize(directory + specifier);
  if (!target) return;
  if (/\.tsx?$/.test(target)) return sources.has(target) ? target : undefined;
  const stem = target.replace(/\.js$/, "");
  return [stem + ".ts", stem + ".tsx"].find((path) => sources.has(path));
}

/** Report changed Pomelo source files without a direct value import in a changed test. */
export function checkTestReach(files: readonly TestReachFile[]): TestReachResult {
  const sources = new Set<string>();
  const tests = new Map<string, string>();
  for (const { path, status, text } of files) {
    if (status === "deleted") continue;
    const normalized = normalize(path.replaceAll("\\", "/"));
    if (!normalized) continue;
    if (pomeloSource.test(normalized) && !normalized.endsWith(".d.ts")) sources.add(normalized);
    if (testFile.test(normalized)) tests.set(normalized, text);
  }

  const reached = new Set<string>();
  for (const [path, text] of tests) {
    if (reached.size === sources.size) break;
    for (const specifier of importedPaths(text)) {
      const source = reachedSource(path, specifier, sources);
      if (source !== undefined) reached.add(source);
    }
  }

  const reason = tests.size === 0 ? "The PR has no changed test files." : "No changed test imports this file.";
  const unreached = [...sources].filter((path) => !reached.has(path)).map((path) => ({ path, reason }));
  const problems = unreached.map(({ path, reason }) => `${path}: ${reason}`);
  return { ok: unreached.length === 0, unreached, problems };
}
