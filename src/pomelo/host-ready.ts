type HostAction = "go" | "clean-up" | "stop";

interface CheckResult {
  name: string;
  action: string;
  reasons: string[];
}

interface HostReadyVerdict {
  action: HostAction;
  summary: string;
  missing: string[];
  byCheck: CheckResult[];
}

const CHECK_ACTIONS: Readonly<Record<string, HostAction>> = Object.freeze({
  go: "go",
  ok: "go",
  "clean-up": "clean-up",
  clean: "clean-up",
  cleanup: "clean-up",
  wait: "clean-up",
  fewer: "clean-up",
  reinstall: "clean-up",
  stop: "stop",
  "too-old": "stop",
  unreadable: "stop",
});

const MAX_REASON_LENGTH = 200;

function isCheckName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readCheckResult(value: unknown): CheckResult | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const { name, action, reasons } = value as Record<string, unknown>;
  if (!isCheckName(name) || typeof action !== "string" || !Array.isArray(reasons)) return;

  const cleanReasons: string[] = [];
  for (const reason of reasons) {
    if (typeof reason !== "string") return;
    cleanReasons.push(reason.replace(/[\p{Cc}\u2028\u2029]/gu, "").slice(0, MAX_REASON_LENGTH));
  }
  return { name, action, reasons: cleanReasons };
}

export function hostReady(required: unknown, results: unknown): HostReadyVerdict {
  const requiredNames = new Set<string>();
  const issues = new Set<string>();
  if (Array.isArray(required)) {
    for (const name of required) {
      if (isCheckName(name)) requiredNames.add(name);
      else issues.add("Invalid required check name.");
    }
  } else {
    issues.add("Required checks must be an array.");
  }

  const checks = new Map<string, { actions: Set<string>; reasons: string[] }>();
  if (Array.isArray(results)) {
    for (const value of results) {
      const result = readCheckResult(value);
      if (!result) {
        issues.add("Invalid check result.");
        continue;
      }

      const { name, action, reasons } = result;
      const previous = checks.get(name);
      if (previous) {
        previous.actions.add(action);
        for (const reason of reasons) previous.reasons.push(reason);
      } else {
        checks.set(name, { actions: new Set([action]), reasons });
      }
    }
  } else {
    issues.add("Check results must be an array.");
  }

  const missing = [...requiredNames].filter((name) => !checks.has(name));
  const byCheck: CheckResult[] = [];
  let action: HostAction = missing.length || issues.size ? "stop" : "go";

  for (const [name, { actions, reasons }] of checks) {
    const [reportedAction] = actions;
    let checkAction = "stop";
    if (actions.size > 1) {
      reasons.push("Conflicting check actions.");
    } else if (!Object.hasOwn(CHECK_ACTIONS, reportedAction)) {
      reasons.push("Unknown check action.");
    } else {
      checkAction = reportedAction;
    }

    const level = CHECK_ACTIONS[checkAction];
    if (level === "stop" || action === "go") action = level;
    byCheck.push({ name, action: checkAction, reasons });
  }

  const runCount = requiredNames.size - missing.length;
  const summary = [`${action} — ${runCount} of ${requiredNames.size} required checks ran.`, ...issues].join(" ");
  return { action, summary, missing, byCheck };
}
