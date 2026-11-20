type JsonObject = Record<string, unknown>;

type InstallProblem = {
  name: string;
  kind: "missing" | "invalid" | "extraneous";
  wanted?: string;
  found?: string;
};

export interface InstallStateResult {
  verdict: "ok" | "reinstall" | "stop";
  problems: InstallProblem[];
  summary: string;
}

const MAX_DEPTH = 64;
const MAX_PROBLEMS = 50;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stop(reason: string): InstallStateResult {
  return { verdict: "stop", problems: [], summary: `stop because ${reason}.` };
}

function compareNames(a: InstallProblem, b: InstallProblem): number {
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

function readProblem(name: string, entry: JsonObject): InstallProblem | undefined {
  const { missing, invalid, extraneous, required, version } = entry;
  const invalidText = typeof invalid === "string" && invalid !== "" ? invalid : undefined;
  let kind: InstallProblem["kind"];
  if (missing === true) kind = "missing";
  else if (invalid === true || invalidText !== undefined) kind = "invalid";
  else if (extraneous === true) kind = "extraneous";
  else return;

  const problem: InstallProblem = { name, kind };
  const wanted = typeof required === "string" ? required : invalidText;
  if (wanted !== undefined) problem.wanted = wanted;
  if (typeof version === "string") problem.found = version;
  return problem;
}

/** Check a captured dependency report without running npm or reading the installation. */
export function installState(npmLsJsonText: string): InstallStateResult {
  if (npmLsJsonText.trim() === "") return stop("the dependency report is empty");

  let report: unknown;
  try {
    report = JSON.parse(npmLsJsonText);
  } catch {
    return stop("the dependency report is not valid JSON");
  }
  if (!isObject(report)) return stop("the dependency report must be a JSON object");
  const { dependencies, problems } = report;
  if (!isObject(dependencies) || Object.keys(dependencies).length === 0) {
    return stop("the report needs a non-empty dependencies object");
  }

  const byName = new Map<string, InstallProblem>();
  const seen = new Set<JsonObject>();
  let incomplete: string | undefined;

  function inspect(entries: JsonObject, depth: number): void {
    if (depth > MAX_DEPTH || seen.has(entries)) {
      incomplete ??= "the dependency tree is too deep or contains a cycle";
      return;
    }
    seen.add(entries);
    for (const [name, entry] of Object.entries(entries)) {
      if (!isObject(entry)) {
        incomplete ??= "a dependency entry is not an object";
        continue;
      }
      const problem = readProblem(name, entry);
      if (problem && !byName.has(name)) byName.set(name, problem);

      const nested = entry.dependencies;
      if (isObject(nested)) inspect(nested, depth + 1);
      else if (nested !== undefined) incomplete ??= "a nested dependencies field is not an object";
    }
  }

  inspect(dependencies, 0);
  if (byName.size > 0) {
    const listed = [...byName.values()].sort(compareNames).slice(0, MAX_PROBLEMS);
    const remaining = byName.size - listed.length;
    const flagged = byName.size === 1 ? "1 package is flagged" : `${byName.size} packages are flagged`;
    const more = remaining > 0 ? `, with ${remaining} more beyond those listed` : "";
    return { verdict: "reinstall", problems: listed, summary: `reinstall because ${flagged}${more}.` };
  }
  if (Array.isArray(problems) && problems.length > 0) {
    return { verdict: "reinstall", problems: [], summary: "reinstall because npm reported dependency problems." };
  }
  if (problems !== undefined && !Array.isArray(problems)) return stop("the problems field must be an array");
  if (Object.hasOwn(report, "error")) return stop("npm reported an error");
  if (incomplete) return stop(incomplete);
  return { verdict: "ok", problems: [], summary: "ok to continue because the dependency report is clean." };
}
