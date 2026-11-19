// Dependency names from Friday v0.3.4's package.json.
export const FRIDAY_BASELINE = Object.freeze([
  "@codemirror/autocomplete",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/language-data",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@homebridge/node-pty-prebuilt-multiarch",
  "@lezer/highlight",
  "@radix-ui/react-use-controllable-state",
  "@tailwindcss/cli",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "@types/ws",
  "@xterm/addon-fit",
  "@xterm/xterm",
  "ai",
  "class-variance-authority",
  "clsx",
  "cmdk",
  "electron",
  "electron-builder",
  "electron-updater",
  "esbuild",
  "ioredis",
  "ioredis-mock",
  "jszip",
  "lucide-react",
  "motion",
  "nanoid",
  "radix-ui",
  "react",
  "react-dom",
  "rehype-katex",
  "remark-math",
  "shiki",
  "streamdown",
  "tailwind-merge",
  "tailwindcss",
  "tsx",
  "tw-animate-css",
  "typescript",
  "undici",
  "ws",
]);

// Add an extra only through a ticket Amit approved.
export const APPROVED_EXTRAS: readonly string[] = Object.freeze([]);

const allowedNames = new Set([...FRIDAY_BASELINE, ...APPROVED_EXTRAS]);
const neverNames = /^(?:(?:openrouter|composio|n8n|openai|browser-use)$|@(?:openrouter|composio|n8n)\/|n8n-)/i;

type DepProblem = { name: string; reason: "never" | "not_listed" };

export function depProblems(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}): DepProblem[] {
  const names = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);

  const problems: DepProblem[] = [];
  for (const name of [...names].sort()) {
    if (neverNames.test(name)) {
      problems.push({ name, reason: "never" });
    } else if (!allowedNames.has(name)) {
      problems.push({ name, reason: "not_listed" });
    }
  }
  return problems;
}
