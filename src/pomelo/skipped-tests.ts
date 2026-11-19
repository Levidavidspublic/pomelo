export type SkippedTestLine = {
  readonly line: number;
  readonly text: string;
};

export type SkippedTestFile = {
  readonly path: string;
  readonly addedLines: readonly SkippedTestLine[];
};

export type SkippedTestKind = "skip" | "only" | "todo";

export type SkippedTestFinding = {
  path: string;
  line: number;
  kind: SkippedTestKind;
};

export type SkippedTestResult = {
  ok: boolean;
  findings: SkippedTestFinding[];
};

const testMethod = /(?<![\w$.])(?:(?:test|it|describe|suite)\s*\.\s*(?<method>skip|only|todo)|t\s*\.\s*(?<contextMethod>skip|todo))\s*\(/;
const testOption = /(?:^|[{,])\s*(?<quote>["']?)(?<option>skip|only|todo)\k<quote>\s*:/;
const testControls = new RegExp(testMethod.source + "|" + testOption.source, "g");
const runnerFlags = /(?:^|[\s"'\x60])--test-(only|skip-pattern)(?=$|[\s"'\x60=;&|)]|\\["'])/g;
const nonCode = /\/\/.*|\/\*.*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60/g;
const quotedOption = /^(["'])(?:skip|only|todo)\1$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scanLine(source: string, inBlockComment: boolean, isRunner: boolean) {
  if (inBlockComment) {
    const end = source.indexOf("*/");
    if (end === -1) return { code: "", inBlockComment: true };
    source = source.slice(end + 2);
    inBlockComment = false;
  }

  const code = source.replace(nonCode, (part) => {
    if (part.startsWith("/*")) {
      inBlockComment = part.indexOf("*/", 2) === -1;
      return " ";
    }
    if (part.startsWith("//")) return "";
    // Keep runner arguments and quoted option keys. Leave a placeholder for other literals.
    return isRunner || quotedOption.test(part) ? part : '""';
  });
  return { code, inBlockComment };
}

/** Check added lines for test controls without needing the surrounding file. */
export function findSkippedTests(files: unknown): SkippedTestResult {
  const findings: SkippedTestFinding[] = [];
  if (!Array.isArray(files)) return { ok: true, findings };

  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string" || !Array.isArray(file.addedLines)) continue;
    const path = file.path.replaceAll("\\", "/");
    const isRunner = path === "package.json" || path === "scripts/test.mjs";
    if (!isRunner && !path.startsWith("test/")) continue;

    let previousLine = 0;
    let inBlockComment = false;
    for (const added of file.addedLines) {
      if (!isRecord(added)) continue;
      const { line, text } = added;
      if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1 || typeof text !== "string") continue;
      const scanned = scanLine(text, line === previousLine + 1 && inBlockComment, isRunner);
      previousLine = line;
      inBlockComment = scanned.inBlockComment;

      const kinds = new Set<SkippedTestKind>();
      if (isRunner) {
        for (const match of scanned.code.matchAll(runnerFlags)) {
          kinds.add(match[1] === "only" ? "only" : "skip");
        }
      } else {
        for (const { groups } of scanned.code.matchAll(testControls)) {
          kinds.add((groups?.method ?? groups?.contextMethod ?? groups?.option) as SkippedTestKind);
        }
      }
      for (const kind of kinds) findings.push({ path: file.path, line, kind });
    }
  }

  return { ok: findings.length === 0, findings };
}
