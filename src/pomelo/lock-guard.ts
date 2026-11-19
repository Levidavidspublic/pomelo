import { isDeepStrictEqual } from "node:util";

type LockProblem = {
  kind: "lock-only-change" | "outside-registry" | "no-integrity" | "lockfile-version";
  name: string;
  detail: string;
};

type JsonObject = Record<string, unknown>;

const lockfileName = "package-lock.json";
const registry = "registry.npmjs.org";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLock(value: unknown) {
  if (!isObject(value)) return;
  const { lockfileVersion, packages, ...metadata } = value;
  if (typeof lockfileVersion !== "number" || !Number.isSafeInteger(lockfileVersion) || !isObject(packages)) return;

  const entries = new Map<string, JsonObject>();
  for (const [path, entry] of Object.entries(packages)) {
    if (!isObject(entry)) return;
    entries.set(path, entry);
  }
  return { lockfileVersion, entries, metadata };
}

function packageName(path: string): string {
  return /(?:^|\/)node_modules\/((?:@[\w.-]+\/)?[\w.-]+)$/.exec(path)?.[1] ?? lockfileName;
}

function hasIntegrity(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function lockProblems(input: {
  before: unknown;
  after: unknown;
  packageJsonChanged: boolean;
}): LockProblem[] {
  const before = readLock(input.before);
  const after = readLock(input.after);
  if (!before || !after) {
    return [{ kind: "lockfile-version", name: lockfileName, detail: "unreadable" }];
  }

  const problems: LockProblem[] = [];
  if (before.lockfileVersion !== after.lockfileVersion || after.lockfileVersion !== 3) {
    const detail = before.lockfileVersion === after.lockfileVersion
      ? String(after.lockfileVersion)
      : `${before.lockfileVersion} -> ${after.lockfileVersion}`;
    problems.push({ kind: "lockfile-version", name: lockfileName, detail });
  }
  if (!input.packageJsonChanged && (
    !isDeepStrictEqual(before.metadata, after.metadata)
    || !isDeepStrictEqual(before.entries.get(""), after.entries.get(""))
  )) {
    problems.push({ kind: "lock-only-change", name: lockfileName, detail: "" });
  }

  const paths = new Set([...before.entries.keys(), ...after.entries.keys()]);
  for (const path of paths) {
    const name = packageName(path);
    const previous = before.entries.get(path);
    const current = after.entries.get(path);
    if (path !== "" && !input.packageJsonChanged && !isDeepStrictEqual(previous, current)) {
      problems.push({ kind: "lock-only-change", name, detail: "" });
    }
    if (!current) continue;

    const hasResolution = Object.hasOwn(current, "resolved");
    if (hasResolution) {
      const resolved = typeof current.resolved === "string" ? current.resolved : "";
      const url = URL.canParse(resolved) ? new URL(resolved) : undefined;
      if (!/^https:\/\//i.test(resolved) || url?.protocol !== "https:" || url.host !== registry) {
        problems.push({ kind: "outside-registry", name, detail: url?.hostname ?? "" });
      }
    }
    // The root and bundled entries can omit both resolution and integrity.
    if (!hasIntegrity(current.integrity) && (hasResolution || hasIntegrity(previous?.integrity))) {
      problems.push({ kind: "no-integrity", name, detail: "" });
    }
  }

  return problems.sort((a, b) =>
    compareText(a.name, b.name) || compareText(a.kind, b.kind) || compareText(a.detail, b.detail));
}
