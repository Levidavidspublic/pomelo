import { isDeepStrictEqual } from "node:util";

export type TsconfigFinding = {
  rule: "strict-off" | "strict-flag-off" | "include-shrunk" | "exclude-added" | "checks-loosened" | "paths-changed" | "unreadable";
  detail: string;
};

const strictFlags = [
  "alwaysStrict",
  "noImplicitAny",
  "noImplicitThis",
  "strictBindCallApply",
  "strictBuiltinIteratorReturn",
  "strictFunctionTypes",
  "strictNullChecks",
  "strictPropertyInitialization",
  "useUnknownInCatchVariables",
];

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

function parseConfig(text: string | null | undefined) {
  if (text == null) return;
  try {
    return asObject(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function entries(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
}

function disableDetail(option: string, value: unknown): string {
  if (value === undefined) return `compilerOptions.${option} was removed.`;
  if (value === false) return `compilerOptions.${option} was set to false.`;
  return `compilerOptions.${option} is no longer true.`;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function checkTsconfigChange(beforeText: string | null | undefined, afterText: string): TsconfigFinding[] {
  const after = parseConfig(afterText);
  if (!after) {
    return [{ rule: "unreadable", detail: "The new tsconfig.json must be a valid JSON object." }];
  }

  const before = parseConfig(beforeText);
  const previous = asObject(before?.compilerOptions) ?? {};
  const current = asObject(after.compilerOptions) ?? {};
  const findings: TsconfigFinding[] = [];

  if ((previous.strict === true && current.strict !== true) || (previous.strict !== false && current.strict === false)) {
    findings.push({ rule: "strict-off", detail: disableDetail("strict", current.strict) });
  }
  for (const flag of strictFlags) {
    if (previous[flag] !== false && current[flag] === false) {
      findings.push({ rule: "strict-flag-off", detail: disableDetail(flag, false) });
    }
  }

  const previousInclude = entries(before?.include);
  const currentInclude = entries(after.include);
  for (const folder of ["src", "test"]) {
    if (previousInclude.has(folder) && !currentInclude.has(folder)) {
      findings.push({ rule: "include-shrunk", detail: `include no longer lists ${JSON.stringify(folder)}.` });
    }
  }

  const previousExclude = entries(before?.exclude);
  for (const entry of entries(after.exclude)) {
    if (!previousExclude.has(entry)) {
      findings.push({ rule: "exclude-added", detail: `exclude now lists ${JSON.stringify(entry)}.` });
    }
  }

  if (current.allowJs === true && current.checkJs !== true && (previous.allowJs !== true || previous.checkJs === true)) {
    findings.push({ rule: "checks-loosened", detail: "compilerOptions.allowJs is enabled without compilerOptions.checkJs." });
  }
  if (previous.noEmit === true && current.noEmit !== true) {
    findings.push({ rule: "checks-loosened", detail: disableDetail("noEmit", current.noEmit) });
  }

  const previousAlias = asObject(previous.paths)?.["@/*"];
  const currentAlias = asObject(current.paths)?.["@/*"];
  if (before && !isDeepStrictEqual(previousAlias, currentAlias)) {
    findings.push({ rule: "paths-changed", detail: 'compilerOptions.paths["@/*"] changed.' });
  }

  return findings.sort((a, b) => compareText(a.rule, b.rule) || compareText(a.detail, b.detail));
}
