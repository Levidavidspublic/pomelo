export const HOME_AUDIT_ALLOWLIST = [
  "src/runner/accounts.ts", // Account settings and per-account directories.
  "src/runner/acp-registry.ts", // ACP registry cache and installed agents.
  "src/runner/adapters.ts", // Custom ACP agent settings.
  "src/runner/computer.ts", // Computer-use settings.
  "src/runner/connections.ts", // Connection settings and generated MCP configs.
  "src/runner/environment.ts", // Per-project environment settings.
  "src/runner/extra-dirs.ts", // Extra directory settings.
  "src/runner/friday-mcp.ts", // MCP shim and mesh connection files.
  "src/runner/git.ts", // Worktrees and snapshot indexes.
  "src/runner/github.ts", // GitHub sign-in state.
  "src/runner/imports.ts", // Reads Friday's worktrees for ACP session discovery.
  "src/runner/limits.ts", // Claude limits cache and usage probe directory.
  "src/runner/own-models.ts", // User-defined model settings.
  "src/runner/runner.ts", // Runner sessions and ACP command, model and effort caches.
  "src/runner/stack.ts", // Saved stacks.
  "src/runner/tool-limits.ts", // Last known tool limits.
  "src/runner/tool-updates.ts", // Tool version check results.
] as const;

const identifier = String.raw`[\w$]+`;
const homeCall = String.raw`(?:${identifier}\s*\.\s*)?\bhomedir\s*\(\s*\)`;
const joinCall = String.raw`\b(?:${identifier}\s*\.\s*)*(?:join|resolve)\s*\(`;
const homeEnv = String.raw`\bprocess\s*\.\s*env\s*(?:\.\s*(?:HOME|USERPROFILE)\b|\[\s*["'](?:HOME|USERPROFILE)["']\s*\])`;
const fridayEnv = String.raw`\bprocess\s*\.\s*env\s*(?:\.\s*FRIDAY_HOME\b|\[\s*["']FRIDAY_HOME["']\s*\])`;
const override = new RegExp(String.raw`${fridayEnv}\s*(?:\|\||\?\?)\s*(?:(?:${joinCall}|\()\s*)*$`);
const separator = String.raw`(?:/|\\)`;
const folder = String.raw`\.friday(?=${separator}|["'\x60])`;
const sourceParts = /(\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)|("(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|\x60(?:\\[\s\S]|[^\x60\\])*\x60)/g;
const pathLiteral = new RegExp(String.raw`^["'\x60](?:${separator}?\.friday(?:${separator}[\s\S]*)?|FRIDAY_HOME|HOME|USERPROFILE)["'\x60]$`);
const homeTemplate = new RegExp(String.raw`^\x60\$\{[^}]+\}${separator}${folder}`);

/** Match direct home-rooted paths and their local aliases in source text. */
export function hasDirectFridayHomePath(source: string): boolean {
  if (!source.includes(".friday")) return false;

  const code = source.replace(sourceParts, (part, comment) => {
    if (comment) return part.replace(/[^\r\n]+/g, " ");
    return pathLiteral.test(part) || homeTemplate.test(part) ? part : '""';
  });
  const homeBinding = new RegExp(String.raw`\bconst\s+(${identifier})\s*=\s*(\(\s*\)\s*=>\s*)?(?:${identifier}(?:\s*\.\s*${identifier})*\s*(?:\?\?|\|\|)\s*)?${homeCall}(?=[ \t]*(?:[;,\r\n}]|$))`, "g");
  const roots = [homeCall, homeEnv];
  for (const [, name, helper] of code.matchAll(homeBinding)) {
    const binding = name.replace(/\$/g, "\\$");
    roots.push(helper ? String.raw`\b${binding}\s*\(\s*\)` : String.raw`\b${binding}(?![\w$])`);
  }

  const home = "(?:" + roots.join("|") + ")";
  const joined = String.raw`${joinCall}\s*${home}\s*,\s*["'\x60]${folder}`;
  const concatenated = String.raw`${home}\s*\+\s*["'\x60]${separator}${folder}`;
  const interpolated = String.raw`\x60\$\{\s*${home}\s*\}${separator}${folder}`;
  const paths = new RegExp([joined, concatenated, interpolated].join("|"), "g");

  for (const match of code.matchAll(paths)) {
    if (!override.test(code.slice(0, match.index))) return true;
  }
  return false;
}
