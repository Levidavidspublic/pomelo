export const PROTECTED_IGNORE_PATTERNS = Object.freeze([
  "node_modules/",
  ".env",
  "*.log",
  "dist/",
  "release/",
  "profiles/",
  "artifacts/",
] as const);

const protectedPatterns = new Set<string>(PROTECTED_IGNORE_PATTERNS);

export type IgnoreFinding = {
  kind: "removed-protected" | "negation-added" | "unreadable";
  /** One-based in the base for removals and in the head for additions, or zero for unreadable text. */
  line: number;
  pattern: string;
};

function readLines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => {
    let end = line.length;
    while (line[end - 1] === " ") end--;
    if (end === line.length) return line;

    // An odd run of backslashes escapes the first trailing space.
    let start = end;
    while (line[start - 1] === "\\") start--;
    return line.slice(0, end + (end - start) % 2);
  });
}

function* unmatchedLines(lines: string[], other: string[]) {
  const remaining = new Map<string, number>();
  for (const pattern of other) {
    remaining.set(pattern, (remaining.get(pattern) ?? 0) + 1);
  }
  for (const [index, pattern] of lines.entries()) {
    const count = remaining.get(pattern) ?? 0;
    if (count > 0) {
      remaining.set(pattern, count - 1);
    } else {
      yield { line: index + 1, pattern };
    }
  }
}

export function checkIgnoreChange(baseText: unknown, headText: unknown): IgnoreFinding[] {
  if (typeof baseText !== "string" || typeof headText !== "string" || !baseText.trim() || !headText.trim()) {
    return [{ kind: "unreadable", line: 0, pattern: "" }];
  }

  const base = readLines(baseText);
  const head = readLines(headText);
  const findings: IgnoreFinding[] = [];
  for (const line of unmatchedLines(base, head)) {
    if (protectedPatterns.has(line.pattern)) findings.push({ kind: "removed-protected", ...line });
  }
  for (const line of unmatchedLines(head, base)) {
    if (line.pattern.startsWith("!")) findings.push({ kind: "negation-added", ...line });
  }
  return findings;
}
