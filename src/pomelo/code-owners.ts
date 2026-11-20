type Finding = { path: string; line: number | null; reason: string };
type Rule = { matcher: RegExp; owners: string[]; line: number };

const ownerHandle = /^@[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/i;
const addressOwner = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function compilePattern(pattern: string): RegExp | undefined {
  if (pattern.startsWith("!") || /[\\[\]?\0]/.test(pattern)) return undefined;

  const anchored = pattern.startsWith("/");
  const directory = pattern.endsWith("/");
  const parts = pattern.slice(anchored ? 1 : 0, directory ? -1 : undefined).split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return undefined;

  // A slash between path parts also anchors the pattern to the repository root.
  const start = anchored || parts.length > 1 ? "^" : "(?:^|/)";
  const body = parts.map((part, index) => {
    const last = index === parts.length - 1;
    if (part === "**") return last ? "[\\s\\S]*" : "(?:[^/]+/)*";

    const escaped = part.replace(/\*+|[.^$+(){}|]/g, (token) => (
      token.startsWith("*") ? "[^/]*" : `\\${token}`
    ));
    return last ? escaped : `${escaped}/`;
  }).join("");

  const descendants = directory ? "/[\\s\\S]+" : "";
  return new RegExp(`${start}${body}${descendants}$`);
}

/** Checks ownership for concrete, repository-relative file paths. */
export function checkCodeOwners(text: string, protectedPaths: readonly string[], requiredOwner: string): {
  ok: boolean;
  findings: Finding[];
} {
  const findings: Finding[] = [];
  const rules: Rule[] = [];
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const content = rawLine.trim().replace(/(?:^|\s)#.*$/, "");
    if (!content) continue;

    const [pattern, ...owners] = content.trimEnd().split(/\s+/);
    const line = index + 1;
    const matcher = compilePattern(pattern);
    if (!matcher || owners.some((owner) => !ownerHandle.test(owner) && !addressOwner.test(owner))) {
      findings.push({ path: "CODEOWNERS", line, reason: "Unreadable CODEOWNERS rule." });
      continue;
    }
    rules.push({ matcher, owners: owners.map((owner) => owner.toLowerCase()), line });
  }

  const owner = requiredOwner.toLowerCase();
  for (const path of protectedPaths) {
    const rule = rules.findLast(({ matcher }) => matcher.test(path));
    if (!rule) {
      findings.push({ path, line: null, reason: "No matching CODEOWNERS rule." });
    } else if (rule.owners.length === 0) {
      findings.push({ path, line: rule.line, reason: "Ownership removed by a rule with no owners." });
    } else if (!ownerHandle.test(owner) || !rule.owners.includes(owner)) {
      findings.push({ path, line: rule.line, reason: "The last matching rule omits the required owner." });
    }
  }

  return { ok: findings.length === 0, findings };
}
