type NpmConfigProblem = { key: string; reason: string };

export interface NpmConfigResult {
  verdict: "go" | "stop";
  problems: NpmConfigProblem[];
}

const npmRegistry = "https://registry.npmjs.org/";

function unreadableConfig(reason: string): NpmConfigResult {
  return { verdict: "stop", problems: [{ key: "config", reason }] };
}

function problemReason(key: string, value: unknown): string | undefined {
  if (key === "registry" || /^@[^:]+:registry$/.test(key)) {
    return value !== npmRegistry ? "Use the default npm registry." : undefined;
  }

  switch (key) {
    case "package-lock":
      return value === false ? "Lockfile use is disabled." : undefined;
    case "force":
      return value === true ? "Force mode bypasses npm safeguards." : undefined;
    case "legacy-peer-deps":
      return value === true ? "Peer dependency checks are disabled." : undefined;
    case "omit":
      return value === "dev" || (Array.isArray(value) && value.includes("dev"))
        ? "Dev dependencies are omitted."
        : undefined;
    case "production":
      return value === true ? "Production mode omits dev dependencies." : undefined;
    case "strict-ssl":
      return value === false ? "TLS certificate verification is disabled." : undefined;
    case "proxy":
    case "https-proxy":
      return value !== null && value !== "" ? "The default proxy behavior is overridden." : undefined;
    case "script-shell":
      return value !== null && value !== "" ? "The default script shell is overridden." : undefined;
  }
}

/** Check captured npm config JSON using reasons that never echo config values. */
export function npmConfigCheck(text: string): NpmConfigResult {
  if (text.trim() === "") return unreadableConfig("The npm config report is empty.");

  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    return unreadableConfig("The npm config report is not valid JSON.");
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return unreadableConfig("The npm config report must be a JSON object.");
  }

  const problems: NpmConfigProblem[] = [];
  const settings = config as Record<string, unknown>;
  for (const key of Object.keys(settings).sort()) {
    const reason = problemReason(key, settings[key]);
    if (reason !== undefined) problems.push({ key, reason });
  }
  return { verdict: problems.length === 0 ? "go" : "stop", problems };
}
