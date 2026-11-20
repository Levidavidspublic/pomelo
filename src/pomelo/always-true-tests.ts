/** Pure, conservative check for trivially passing assertions in PR-added Pomelo tests. */
export type AlwaysTrueTestLine = {
  readonly line: number;
  readonly text: string;
};

export type AlwaysTrueTestFile = {
  readonly path: string;
  readonly addedLines: readonly AlwaysTrueTestLine[];
};

export type AlwaysTrueReason =
  | "truthy-literal"
  | "same-value"
  | "distinct-literals"
  | "empty-callback";

export type AlwaysTrueFinding = {
  path: string;
  line: number;
  reason: AlwaysTrueReason;
};

export type AlwaysTrueResult = {
  ok: boolean;
  findings: AlwaysTrueFinding[];
};

type Literal = { type: "string" | "number" | "bigint" | "boolean" | "null" | "undefined"; value: string | number | bigint | boolean | null | undefined };

const testFile = /^test\/pomelo-[^/]+\.test\.ts$/;
const assertion = /\bassert\s*(?:\.\s*(?:strict\s*\.\s*)?(ok|equal|strictEqual|deepEqual|deepStrictEqual|notEqual|doesNotThrow))?\s*\(/g;
const reference = /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*|\[\s*(?:\d+|["'][^"'\\]+["'])\s*\])*$/;
const number = /^[+-]?(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]+)(?:[eE][+-]?\d[\d_]*)?)n?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAddedLine(value: unknown): value is AlwaysTrueTestLine {
  return isRecord(value) && Number.isSafeInteger(value.line) && (value.line as number) > 0
    && typeof value.text === "string";
}

/** Mask strings and comments without shifting indices in the source line. */
function codeMask(line: string, comment: { block: boolean }): string {
  const mask = line.split("");
  for (let index = 0; index < line.length;) {
    if (comment.block) {
      if (line.startsWith("*/", index)) {
        mask[index++] = " ";
        mask[index++] = " ";
        comment.block = false;
      } else mask[index++] = " ";
      continue;
    }
    if (line.startsWith("//", index)) {
      mask.fill(" ", index);
      break;
    }
    if (line.startsWith("/*", index)) {
      comment.block = true;
      mask[index++] = " ";
      mask[index++] = " ";
      continue;
    }
    // A regex literal is data, not an assertion call. Recognize it only in
    // expression-start positions so division does not hide executed checks.
    const previous = line.slice(0, index).trimEnd();
    if (line[index] === "/" && (previous === "" || /[=(:,!\[{]$/.test(previous)
      || /\b(?:return|throw|case|yield)$/.test(previous))) {
      mask[index++] = " ";
      let characterClass = false;
      while (index < line.length) {
        const current = line[index];
        mask[index++] = " ";
        if (current === "\\" && index < line.length) mask[index++] = " ";
        else if (current === "[") characterClass = true;
        else if (current === "]") characterClass = false;
        else if (current === "/" && !characterClass) {
          while (index < line.length && /[a-z]/i.test(line[index])) mask[index++] = " ";
          break;
        }
      }
      continue;
    }
    const quote = line[index];
    if (quote === '"' || quote === "'" || quote === "`") {
      mask[index++] = " ";
      while (index < line.length) {
        const current = line[index];
        mask[index++] = " ";
        if (current === "\\" && index < line.length) mask[index++] = " ";
        else if (current === quote) break;
      }
      continue;
    }
    index++;
  }
  return mask.join("");
}

function splitArguments(source: string, mask: string, open: number): string[] | undefined {
  let depth = 0;
  let start = open + 1;
  const args: string[] = [];
  for (let index = open; index < mask.length; index++) {
    const char = mask[index];
    if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") {
      depth--;
      if (depth === 0) {
        const last = source.slice(start, index).trim();
        if (last || args.length) args.push(last);
        return args;
      }
      if (depth < 0) return undefined;
    } else if (char === "," && depth === 1) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  return undefined;
}

function unparenthesize(expr: string): string {
  let text = expr.trim();
  while (text.startsWith("(") && text.endsWith(")") && /^\(\s*[^()]+\s*\)$/.test(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function literalOf(input: string): Literal | undefined {
  const value = unparenthesize(input);
  if (value === "true") return { type: "boolean", value: true };
  if (value === "false") return { type: "boolean", value: false };
  if (value === "null") return { type: "null", value: null };
  if (value === "undefined") return { type: "undefined", value: undefined };
  if (/^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/.test(value)) {
    return { type: "string", value: value.slice(1, -1) };
  }
  if (number.test(value)) {
    try {
      if (value.endsWith("n")) return { type: "bigint", value: BigInt(value.slice(0, -1).replace(/_/g, "")) };
      const parsed = Number(value.replace(/_/g, ""));
      if (!Number.isNaN(parsed)) return { type: "number", value: parsed };
    } catch {
      return undefined;
    }
  }
}

function alwaysTruthy(input: string): boolean {
  const value = unparenthesize(input);
  if (value === "[]" || value === "{}") return true;
  const literal = literalOf(value);
  return literal !== undefined && Boolean(literal.value);
}

function sameValue(left: string, right: string): boolean {
  const first = unparenthesize(left);
  const second = unparenthesize(right);
  const a = literalOf(first);
  const b = literalOf(second);
  if (a && b) return a.type === b.type && Object.is(a.value, b.value);
  return reference.test(first) && first === second;
}

function definitelyDifferentLiterals(left: string, right: string): boolean {
  const a = literalOf(left);
  const b = literalOf(right);
  // Mixed types can compare equal with loose equality; do not claim certainty.
  return !!a && !!b && a.type === b.type && !Object.is(a.value, b.value);
}

function emptyCallback(value: string): boolean {
  return /^\s*(?:async\s+)?(?:\(\s*\)|[a-zA-Z_$][\w$]*)\s*=>\s*\{\s*\}\s*$/.test(value);
}

function classify(line: string, mask: string): AlwaysTrueReason | undefined {
  const pattern = new RegExp(assertion);
  for (let match = pattern.exec(mask); match; match = pattern.exec(mask)) {
    // Do not match logger.assert(...) or a property with a similar name.
    const prefix = mask.slice(0, match.index).trimEnd();
    if (prefix.endsWith(".") || prefix.endsWith("?.")) continue;
    const method = match[1] ?? "ok";
    const open = pattern.lastIndex - 1;
    const args = splitArguments(line, mask, open);
    if (!args) continue;
    if (method === "ok" && args.length && alwaysTruthy(args[0])) return "truthy-literal";
    if (["equal", "strictEqual", "deepEqual", "deepStrictEqual"].includes(method)
      && args.length >= 2 && sameValue(args[0], args[1])) return "same-value";
    if (method === "notEqual" && args.length >= 2
      && definitelyDifferentLiterals(args[0], args[1])) return "distinct-literals";
    if (method === "doesNotThrow" && args.length && emptyCallback(args[0])) return "empty-callback";
  }
}

/** Inspect only the PR's added Pomelo test lines; never read the filesystem. */
export function findAlwaysTrueChecks(files: unknown): AlwaysTrueResult {
  const findings: AlwaysTrueFinding[] = [];
  if (!Array.isArray(files)) return { ok: true, findings };

  for (const entry of files) {
    if (!isRecord(entry) || typeof entry.path !== "string" || !testFile.test(entry.path)
      || !Array.isArray(entry.addedLines)) continue;
    const lines = entry.addedLines.filter(isAddedLine).sort((a, b) => a.line - b.line);
    const comment = { block: false };
    let previous: number | undefined;
    for (const { line, text } of lines) {
      if (previous !== undefined && line !== previous + 1) comment.block = false;
      previous = line;
      const reason = classify(text, codeMask(text, comment));
      if (reason) findings.push({ path: entry.path, line, reason });
    }
  }
  findings.sort((a, b) => a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1);
  return { ok: findings.length === 0, findings };
}
