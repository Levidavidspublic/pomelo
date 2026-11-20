export const SHELL_RULES = [
  { name: "child-process", pattern: /(?<![\w$])(?:from\s*|import\s*|(?:import|require)\s*\(\s*)(['"`])(?:node:)?child_process\1/ },
  { name: "eval", pattern: /(?<![\w$])eval\s*\(/ },
  { name: "new-function", pattern: /(?<![\w$])new\s+Function\s*\(/ },
  { name: "vm-run-in", pattern: /(?<![\w$])vm\s*\.\s*runIn/ },
  { name: "process-binding", pattern: /(?<![\w$])process\s*\.\s*binding(?![\w$])/ },
] as const;

type ChangedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

type Finding = {
  path: string;
  line: number;
  rule: (typeof SHELL_RULES)[number]["name"];
};

export function shellGuard(files: readonly ChangedFile[], allow: readonly string[] = []): Finding[] {
  const allowedPaths = new Set(allow);
  const findings: Finding[] = [];

  for (const { path, added } of files) {
    if (!path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) continue;
    if (allowedPaths.has(path)) continue;

    for (const { line, text } of added) {
      for (const { name, pattern } of SHELL_RULES) {
        if (pattern.test(text)) findings.push({ path, line, rule: name });
      }
    }
  }

  return findings;
}
