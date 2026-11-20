const CALL_RULES = [
  "console.log",
  "console.info",
  "console.debug",
  "console.warn",
  "console.error",
  "console.dir",
  "console.table",
  "console.trace",
  "process.stdout.write",
  "process.stderr.write",
] as const;

const IDENTIFIER_PREFIX = String.raw`(?<![\p{ID_Continue}$\u200c\u200d#])`;
const MEMBER_ACCESS = String.raw`\s*(?:\.|\?\.)\s*`;
const CALL_START = String.raw`\s*(?:\?\.\s*)?\(`;

export const LOG_RULES = [
  ...CALL_RULES.map((name) => ({
    name,
    pattern: new RegExp(IDENTIFIER_PREFIX + name.split(".").join(MEMBER_ACCESS) + CALL_START, "u"),
  })),
  {
    name: "debugger",
    pattern: new RegExp(IDENTIFIER_PREFIX + String.raw`(?<!\.\s*)debugger(?=\s*(?:[;}]|$))`, "u"),
  },
] as const;

const NON_CODE = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[\s\S]*|\/\*[\s\S]*?(?:\*\/|$)/g;

type ChangedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

type Finding = {
  path: string;
  line: number;
  rule: (typeof LOG_RULES)[number]["name"];
};

/** Check direct calls and debugger statements on added lines, with comment context from consecutive additions. */
export function logGuard(files: readonly ChangedFile[], allow: readonly string[] = []): Finding[] {
  const allowedPaths = new Set(allow);
  const findings: Finding[] = [];

  for (const { path, added } of files) {
    if (!path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) continue;
    if (allowedPaths.has(path)) continue;

    let blockCommentOpen = false;
    let previousLine: number | undefined;

    for (const { line, text } of added) {
      let code = text;
      if (blockCommentOpen && previousLine === line - 1) {
        const end = code.indexOf("*/");
        previousLine = line;
        if (end === -1) continue;
        code = code.slice(end + 2);
      }

      previousLine = line;
      blockCommentOpen = false;
      code = code.replace(NON_CODE, (match) => {
        if (match.startsWith("/*") && (match.length < 4 || !match.endsWith("*/"))) {
          blockCommentOpen = true;
        }
        return " ";
      });

      for (const { name, pattern } of LOG_RULES) {
        if (pattern.test(code)) findings.push({ path, line, rule: name });
      }
    }
  }

  return findings;
}
