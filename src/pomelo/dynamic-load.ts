const REASONS = {
  "dynamic-import": "Use one quoted string literal as the import path.",
  "dynamic-require": "Use one quoted string literal as the require path.",
  "create-require": "createRequire creates a loader with its own resolution base.",
  "module-register": "module.register can install custom module loading hooks.",
  "dynamic-resolve": "Use one quoted string literal as the import.meta.resolve path.",
  "dynamic-worker": "Use a quoted worker path or a URL with a quoted path and import.meta.url as its base.",
  "vm-context-runner": "This vm method executes source as code.",
  "vm-script": "vm.Script compiles source as code.",
} as const;

type Rule = keyof typeof REASONS;

export const DYNAMIC_LOAD_RULES: readonly Rule[] = Object.freeze(Object.keys(REASONS) as Rule[]);

type ChangedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

type Finding = { path: string; line: number; rule: Rule; reason: string };
type Token = { text: string; line: number; quoted?: boolean; identifier?: boolean };

const LOADERS: readonly {
  rule: Rule;
  callee: readonly string[];
  pathArgument?: "single" | "worker";
}[] = [
  { rule: "dynamic-import", callee: ["import"], pathArgument: "single" },
  { rule: "dynamic-require", callee: ["require"], pathArgument: "single" },
  { rule: "dynamic-require", callee: ["module", ".", "require"], pathArgument: "single" },
  { rule: "create-require", callee: ["createRequire"] },
  { rule: "module-register", callee: ["module", ".", "register"] },
  { rule: "dynamic-resolve", callee: ["import", ".", "meta", ".", "resolve"], pathArgument: "single" },
  { rule: "dynamic-worker", callee: ["new"], pathArgument: "worker" },
  { rule: "vm-context-runner", callee: ["vm", ".", "runInNewContext"] },
  { rule: "vm-context-runner", callee: ["vm", ".", "runInThisContext"] },
  { rule: "vm-script", callee: ["new", "vm", ".", "Script"] },
];

const CODE_TOKEN = /(?<trivia>\s+|\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?(?:\*\/|$))|(?<quoted>"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')|(?<identifier>[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*)|=>|\?\.|\+\+|--|[\s\S]/uy;
const TEMPLATE_TOKEN = /\\[\s\S]|\$\{|`|[^\\`$]+|[\s\S]/y;
const REGEX_LITERAL = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/y;
const REGEX_PREFIX = /^(?:[=(:,;!&|?~+*%^{\[]|=>|return|throw|case|typeof|void|yield)$/;
const CONTROL_HEAD = /^(?:if|while|for|with)$/;

function tokenize(source: string, firstLine: number): Token[] {
  const tokens: Token[] = [];
  const code = new RegExp(CODE_TOKEN);
  const template = new RegExp(TEMPLATE_TOKEN);
  const regex = new RegExp(REGEX_LITERAL);
  const interpolationDepths: number[] = [];
  const controlParens: boolean[] = [];
  let afterControlHead = false;
  let templateText = false;
  let line = firstLine;

  for (let offset = 0; offset < source.length;) {
    const pattern = templateText ? template : code;
    pattern.lastIndex = offset;
    const match = pattern.exec(source)!;
    let [text] = match;
    offset = pattern.lastIndex;

    if (templateText) {
      // Keep template text opaque while scanning the code inside each ${...}.
      if (text === "${") {
        interpolationDepths.push(0);
        templateText = false;
        tokens.push({ text: "{", line, quoted: false });
      } else if (text === "`") {
        templateText = false;
        tokens.push({ text, line, quoted: false });
      }
    } else if (!match.groups?.trivia) {
      const previous = tokens.at(-1)?.text;
      // A fragment can start with the end of a comment opened on an unchanged line.
      if (previous === undefined && text === "*" && source[offset] === "/") {
        offset++;
        continue;
      }
      // With no preceding code at a diff gap, a slash may continue a division expression.
      if (text === "/" && (afterControlHead || (previous === undefined ? firstLine === 1 : REGEX_PREFIX.test(previous)))) {
        regex.lastIndex = match.index;
        const literal = regex.exec(source);
        if (literal) {
          [text] = literal;
          offset = regex.lastIndex;
        }
      }

      if (text === "(") {
        const beforePrevious = tokens.at(-2)?.text;
        controlParens.push(CONTROL_HEAD.test(previous ?? "") && beforePrevious !== "." && beforePrevious !== "?.");
      }
      afterControlHead = text === ")" && controlParens.pop() === true;

      if (text === "`") templateText = true;
      const depth = interpolationDepths.length - 1;
      if (depth >= 0) {
        if (text === "{") interpolationDepths[depth]++;
        if (text === "}" && interpolationDepths[depth] === 0) {
          interpolationDepths.pop();
          templateText = true;
        } else if (text === "}") {
          interpolationDepths[depth]--;
        }
      }
      tokens.push({ text, line, quoted: Boolean(match.groups?.quoted), identifier: Boolean(match.groups?.identifier) });
    }
    line += text.split("\n").length - 1;
  }
  return tokens;
}

function matches(tokens: readonly Token[], start: number, sequence: readonly string[], optionalAccess = false): boolean {
  return sequence.every((text, index) => {
    const actual = tokens[start + index]?.text;
    return actual === text || (optionalAccess && text === "." && actual === "?.");
  });
}

function endsCall(tokens: readonly Token[], index: number): boolean {
  return tokens[index]?.text === ")" || matches(tokens, index, [",", ")"]);
}

function isWorkerPath(tokens: readonly Token[], arg: number): boolean {
  const endsArgument = (index: number) => tokens[index]?.text === "," || tokens[index]?.text === ")";
  if (tokens[arg]?.quoted) return endsArgument(arg + 1);

  // The URL itself must be the whole argument, so a property access or other expression fails.
  if (!matches(tokens, arg, ["new", "URL", "("]) || !tokens[arg + 3]?.quoted) return false;
  const base = [",", "import", ".", "meta", ".", "url"];
  const urlEnd = arg + 4 + base.length;
  if (!matches(tokens, arg + 4, base) || !endsCall(tokens, urlEnd)) return false;
  return endsArgument(urlEnd + (tokens[urlEnd].text === "," ? 2 : 1));
}

function checkRun(tokens: readonly Token[], path: string, findings: Finding[]): void {
  const reported = new Map<number, Set<Rule>>();
  for (const [index, { line }] of tokens.entries()) {
    const previous = tokens[index - 1]?.text;
    if (previous === "function") continue;
    const isProperty = previous === "." || previous === "?.";
    for (const { rule, callee, pathArgument } of LOADERS) {
      if (isProperty && rule !== "create-require") continue;
      if (!matches(tokens, index, callee, true)) continue;
      let open = index + callee.length;
      if (pathArgument === "worker") {
        // A browser global or a module namespace may qualify the constructor.
        if (tokens[open]?.identifier && tokens[open + 1]?.text === ".") open += 2;
        const constructor = tokens[open]?.text;
        if (constructor !== "Worker" && constructor !== "SharedWorker") continue;
        open++;
      }
      if (tokens[open]?.text === "?.") open++;
      if (tokens[open]?.text !== "(") continue;

      const arg = open + 1;
      if (pathArgument === "single" && tokens[arg]?.quoted && endsCall(tokens, arg + 1)) continue;
      if (pathArgument === "worker" && isWorkerPath(tokens, arg)) continue;

      const rules = reported.get(line) ?? new Set<Rule>();
      if (rules.has(rule)) continue;
      rules.add(rule);
      reported.set(line, rules);
      findings.push({ path, line, rule, reason: REASONS[rule] });
    }
  }
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Scan the visible calls in added code. Gaps in the diff have no source context. */
export function dynamicLoadGuard(files: readonly ChangedFile[], allow: readonly string[] = []): Finding[] {
  const allowedPaths = new Set(allow);
  const findings: Finding[] = [];

  for (const { path, added } of files) {
    if (!path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) continue;
    if (allowedPaths.has(path)) continue;

    const lines = [...added].sort((a, b) => a.line - b.line);
    // A gap can conceal either a closing comment or intervening code.
    for (let start = 0, end = 1; end <= lines.length; end++) {
      if (lines[end]?.line === lines[end - 1].line + 1) continue;
      const source = lines.slice(start, end).map(({ text }) => text).join("\n");
      checkRun(tokenize(source, lines[start].line), path, findings);
      start = end;
    }
  }

  return findings.sort((a, b) => compareText(a.path, b.path) || a.line - b.line || compareText(a.rule, b.rule));
}
