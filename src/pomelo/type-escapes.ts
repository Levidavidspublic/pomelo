export interface AddedLine {
  line: number;
  text: string;
}

export interface TypeEscapeFile {
  path: string;
  addedLines: readonly AddedLine[];
}

export type TypeEscapeRule =
  | "ts-ignore"
  | "ts-nocheck"
  | "ts-expect-error-bare"
  | "as-any"
  | "any-annotation"
  | "double-cast";

export interface TypeEscapeFinding {
  path: string;
  line: number;
  rule: TypeEscapeRule;
}

const pomeloPath = /^(?:src\/(?:client\/)?pomelo\/|test\/pomelo-[^/]*\.test\.ts$)/;
const commentDirective = /^[/\s*]*@(ts-ignore|ts-nocheck|ts-expect-error)\b/;
const reasonText = /[\p{L}\p{N}]/u;

// Match comments and literals together so a delimiter inside a literal stays masked.
const comments = /(\/\/.*|\/\*.*?(?:\*\/|$)|^\s*\*+(?=\s*@).*)/;
const strings = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/;
// Recognize regex literals in common expression positions and leave division in the code.
const regexStart = /(?<=^\s*|[=(:,;!&|?{\[]\s*|=>\s*|(?<![.\w$])(?:return|throw|yield|case)\s+)/;
const regexLiteral = /\/(?:\\.|[^/\\\[]|\[(?:\\.|[^\]\\])*\])+\/[dgimsuvy]*/;
const nonCode = new RegExp(`${comments.source}|${strings.source}|${regexStart.source}${regexLiteral.source}`, "g");

const codeRules: readonly [TypeEscapeRule, RegExp][] = [
  ["as-any", /(?<![\w$])as\s+any(?![\w$])/],
  ["any-annotation", /:\s*any(?![\w$])|<\s*any\s*>|(?<![\w$])any\s*\[\s*\]/],
  ["double-cast", /(?<![\w$])as\s+unknown\s+as(?![\w$])/],
];

function directiveRule(comment: string): TypeEscapeRule | undefined {
  const match = commentDirective.exec(comment);
  const directive = match?.[1];
  if (directive === "ts-ignore" || directive === "ts-nocheck") return directive;
  if (match && !reasonText.test(comment.slice(match[0].length))) return "ts-expect-error-bare";
}

/** Inspect each added line independently and report each matching rule once per line. */
export function findTypeEscapes(files: readonly TypeEscapeFile[]): TypeEscapeFinding[] {
  const findings: TypeEscapeFinding[] = [];

  for (const file of files) {
    const path = file.path.replaceAll("\\", "/");
    if (!pomeloPath.test(path)) continue;

    for (const { line, text } of file.addedLines) {
      const rules = new Set<TypeEscapeRule>();
      const code = text.replace(nonCode, (_match, comment: string | undefined) => {
        if (comment === undefined) return "#";
        const rule = directiveRule(comment);
        if (rule) rules.add(rule);
        return " ";
      });

      for (const [rule, pattern] of codeRules) {
        if (pattern.test(code)) rules.add(rule);
      }
      for (const rule of rules) findings.push({ path, line, rule });
    }
  }

  return findings.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    return 0;
  });
}
