const component = "(0|[1-9][0-9]*)";
const versionPattern = new RegExp(`^v${component}\\.${component}\\.${component}$`);
const minimumPattern = new RegExp(`^>=${component}(?:\\.${component}\\.${component})?$`);
const caretPattern = new RegExp(`^\\^${component}$`);
const wildcardPattern = new RegExp(`^${component}\\.x$`);

export interface NodeVersionCheck {
  verdict: "ok" | "too-old" | "unreadable";
  reason: string;
  found?: string;
  wanted?: string;
}

function versionNumbers(match: RegExpExecArray | null) {
  if (!match) return undefined;
  const [, major, minor = "0", patch = "0"] = match;
  const parts = [Number(major), Number(minor), Number(patch)] as const;
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

export function checkNodeVersion(versionText: string, packageJsonText: string): NodeVersionCheck {
  const found = typeof versionText === "string" ? versionText.trim() : "";
  const current = versionNumbers(versionPattern.exec(found));
  if (!current) {
    return { verdict: "unreadable", reason: "Expected node --version to print a version like v22.3.0." };
  }

  let manifest: { engines?: { node?: unknown } } | null;
  try {
    manifest = JSON.parse(packageJsonText);
  } catch {
    return { verdict: "unreadable", reason: "package.json is not valid JSON.", found };
  }

  const nodeEngine = manifest?.engines?.node;
  const wanted = typeof nodeEngine === "string" ? nodeEngine.trim() : "";
  if (!wanted) {
    return { verdict: "unreadable", reason: "package.json needs a non-empty engines.node string.", found };
  }

  const minimum = minimumPattern.exec(wanted);
  const required = versionNumbers(minimum ?? caretPattern.exec(wanted) ?? wildcardPattern.exec(wanted));
  if (!required) {
    return { verdict: "unreadable", reason: "The engines.node range must use >=N, >=N.M.P, ^N, or N.x.", found };
  }

  const [major, minor, patch] = current;
  const [requiredMajor, requiredMinor, requiredPatch] = required;
  const supported = minimum
    ? (major - requiredMajor || minor - requiredMinor || patch - requiredPatch) >= 0
    : major === requiredMajor;

  return {
    verdict: supported ? "ok" : "too-old",
    reason: supported
      ? `Node ${found} satisfies engines.node ${wanted}.`
      : `Node ${found} does not satisfy engines.node ${wanted}.`,
    found,
    wanted,
  };
}
