export const NEVER_RULES = [
  { name: "openrouter", pattern: /openrouter/i },
  { name: "composio", pattern: /composio/i },
  { name: "n8n", pattern: /\bn8n\b/i },
  { name: "openai-api", pattern: /(?<![\w-])api\.openai\.com(?![\w-]|\.[\w-])/i },
  { name: "claude-login", pattern: /(?<![\w-])claude\.ai\/(?:login|oauth|api\/auth)(?![\w-])/i },
] as const;

type ChangedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

type Finding = {
  path: string;
  line: number;
  rule: (typeof NEVER_RULES)[number]["name"];
};

export function neverGuard(files: readonly ChangedFile[], allow: readonly string[] = []): Finding[] {
  const allowedPaths = new Set(allow);
  const findings: Finding[] = [];

  for (const { path, added } of files) {
    if (!path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) continue;
    if (allowedPaths.has(path)) continue;

    for (const { line, text } of added) {
      for (const { name, pattern } of NEVER_RULES) {
        if (pattern.test(text)) findings.push({ path, line, rule: name });
      }
    }
  }

  return findings;
}
