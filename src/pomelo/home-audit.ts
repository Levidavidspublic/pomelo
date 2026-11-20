export const HOME_AUDIT_ALLOWLIST = [
  "src/guardrails.ts", // Protects Friday's data from writes and deletions.
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
const comment = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\//;
const regexLiteral = /(?<=[=(:,!&|?;{}\[]\s*|\breturn\s+)\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/;
const stringLiteral = /"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|\x60(?:\\[\s\S]|[^\x60\\])*\x60/;
const sourceParts = new RegExp(`(${comment.source})|(${regexLiteral.source})|${stringLiteral.source}`, "g");
const pathLiteral = new RegExp(String.raw`^["'\x60](?:${separator}?\.friday(?:${separator}[\s\S]*)?|FRIDAY_HOME|HOME|USERPROFILE)["'\x60]$`);
const homeTemplate = new RegExp(String.raw`^\x60\$\{[^}]+\}${separator}${folder}`);

const directHome = new RegExp(String.raw`^(?:${homeCall}|${homeEnv})$`);
const pathRoot = String.raw`(${homeCall}|${homeEnv}|${identifier}(?:\s*\(\s*\))?)`;
const joined = String.raw`${joinCall}\s*${pathRoot}\s*,\s*["'\x60]${folder}`;
const concatenated = String.raw`(?<![\w$.])${pathRoot}\s*\+\s*["'\x60]${separator}${folder}`;
const interpolated = String.raw`\x60\$\{\s*${pathRoot}\s*\}${separator}${folder}`;
const paths = new RegExp([joined, concatenated, interpolated].join("|"), "g");

const functionBlock = String.raw`\bfunction\s+${identifier}\s*\((?<params>[^()]*)\)(?:\s*:\s*[^{};=\r\n]+)?\s*\{`;
const declaration = String.raw`\bconst\s+(?<name>${identifier})\s*=\s*`;
const scopeTokens = new RegExp(String.raw`${functionBlock}|${declaration}|[{}]`, "g");
const endOfBinding = String.raw`(?=[ \t]*(?:[;,\r\n}]|$))`;
const homeBinding = new RegExp(String.raw`^(\(\s*\)\s*=>\s*)?(?:${identifier}(?:\s*\.\s*${identifier})*\s*(?:\?\?|\|\|)\s*)?(?:${homeCall}|${homeEnv})${endOfBinding}`);
const trimmedHome = new RegExp(String.raw`^(${identifier})\s*\.\s*replace\(\s*/\\/\$/\s*,\s*(?:""|'')\s*\)${endOfBinding}`);
const blank = (text: string) => text.replace(/[^\r\n]/g, " ");

type HomeBinding = "directory" | "helper" | "other";

/** Find local home aliases in the blocks enclosing a candidate path. */
function usesHomeBinding(code: string, offset: number, root: string): boolean {
  const structure = code.replace(sourceParts, blank);
  const bindings: Map<string, HomeBinding>[] = [new Map()];
  const lookup = (name: string) => bindings.findLast((scope) => scope.has(name))?.get(name);

  for (const match of structure.matchAll(scopeTokens)) {
    if (match.index >= offset) break;
    const { params, name } = match.groups!;
    if (match[0] === "}") {
      if (bindings.length > 1) bindings.pop();
    } else if (name !== undefined) {
      const initializer = code.slice(match.index + match[0].length);
      const home = homeBinding.exec(initializer);
      const trimmed = trimmedHome.exec(initializer);
      let kind: HomeBinding = "other";
      if (home) kind = home[1] ? "helper" : "directory";
      if (trimmed && lookup(trimmed[1]!) === "directory") kind = "directory";
      bindings.at(-1)!.set(name, kind);
    } else {
      const scope = new Map<string, HomeBinding>();
      // These functions conventionally name the caller-supplied home directory "home".
      for (const param of params?.split(",") ?? []) {
        const paramName = param.trim().match(/^[\w$]+/)?.[0];
        if (paramName) scope.set(paramName, paramName === "home" ? "directory" : "other");
      }
      bindings.push(scope);
    }
  }
  const name = root.match(/^[\w$]+/)?.[0];
  return name !== undefined && lookup(name) === (root.endsWith(")") ? "helper" : "directory");
}

/** Match direct home-rooted paths and their local aliases in source text. */
export function hasDirectFridayHomePath(source: string): boolean {
  if (!source.includes(".friday")) return false;

  const code = source.replace(sourceParts, (part, isComment, regex) => {
    if (isComment) return blank(part);
    if (regex || pathLiteral.test(part) || homeTemplate.test(part)) return part;
    return part[0] + blank(part.slice(1, -1)) + part.at(-1);
  });

  for (const match of code.matchAll(paths)) {
    if (override.test(code.slice(0, match.index))) continue;
    const root = (match[1] ?? match[2] ?? match[3])!;
    if (directHome.test(root) || usesHomeBinding(code, match.index, root)) return true;
  }
  return false;
}
