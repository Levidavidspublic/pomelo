export const RULE_FILE_PATHS = Object.freeze([
  "docs/harness/",
  "AGENTS.md",
  "CLAUDE.md",
  "POMELO.md",
  ".coderabbit.yaml",
  "factory/SLOTS.md",
  "CONTRIBUTING.md",
]);

export interface RuleFileFinding {
  path: string;
  kind: "added" | "changed" | "deleted" | "renamed-from" | "renamed-to";
  reason: string;
}

const rulePaths = RULE_FILE_PATHS.map((path) => path.toLowerCase());
const nameStatus = /^(?:[ADT]|[MRC](?:100|0?\d{1,2})?)$/;
const quotedPath = /^"(?:[^"\\]|\\(?:[abfnrtv"\\]|[0-3][0-7]{2}))+"$/;
const pathEscape = /(?:\\[0-3][0-7]{2})+|\\([abfnrtv"\\])/g;
const escapedCharacters: Readonly<Record<string, string>> = {
  a: "\x07",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  '"': '"',
  "\\": "\\",
};
const pathDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

function readPath(field: string): string | undefined {
  if (field.startsWith('"')) {
    if (!quotedPath.test(field)) return undefined;
    field = field.slice(1, -1).replace(pathEscape, (escape, character: string | undefined) => {
      if (character !== undefined) return escapedCharacters[character];

      // Git quotes UTF-8 bytes in octal. Decode each byte sequence together.
      const bytes = escape.slice(1).split("\\").map((octal) => Number.parseInt(octal, 8));
      return pathDecoder.decode(Uint8Array.from(bytes));
    });
  }
  return field && !field.includes("\0") && !field.endsWith("/") ? field : undefined;
}

function reportRuleFile(findings: RuleFileFinding[], path: string, kind: RuleFileFinding["kind"]): void {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const isRuleFile = rulePaths.some((rule) => rule.endsWith("/")
    ? normalized.startsWith(rule) && normalized.length > rule.length
    : normalized === rule);

  if (isRuleFile) {
    findings.push({ path, kind, reason: "This file defines kitchen rules and requires Amit's review." });
  }
}

export function ruleFileChanges(nameStatusText: string): RuleFileFinding[] {
  if (typeof nameStatusText !== "string") return [];

  const findings: RuleFileFinding[] = [];
  for (const line of nameStatusText.split(/\r?\n/)) {
    const fields = line.split("\t");
    const [status, sourceField, destinationField] = fields;
    if (!nameStatus.test(status)) continue;

    const action = status[0];
    const hasDestination = action === "R" || action === "C";
    if (fields.length !== (hasDestination ? 3 : 2)) continue;

    const source = readPath(sourceField);
    if (!source) continue;

    if (hasDestination) {
      const destination = readPath(destinationField);
      if (!destination) continue;

      if (action === "R") {
        reportRuleFile(findings, source, "renamed-from");
        reportRuleFile(findings, destination, "renamed-to");
      } else {
        reportRuleFile(findings, destination, "added");
      }
    } else {
      const kind = action === "A" ? "added" : action === "D" ? "deleted" : "changed";
      reportRuleFile(findings, source, kind);
    }
  }
  return findings;
}
