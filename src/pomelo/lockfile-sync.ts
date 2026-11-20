type JsonObject = Record<string, unknown>;

type LockfileSyncProblem = {
  name: string;
  kind: "missing-from-lock" | "missing-from-package" | "range-mismatch" | "bad-input";
  wanted?: string;
  locked?: string;
};

export interface LockfileSyncResult {
  verdict: "go" | "stop";
  problems: LockfileSyncProblem[];
}

const dependencyFields = ["dependencies", "optionalDependencies", "devDependencies"] as const;
type DependencyField = typeof dependencyFields[number];
type Declaration = {
  ranges: Partial<Record<DependencyField, string>>;
  effective: string;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObject(text: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function readDependencies(root: JsonObject): Map<string, Declaration> | undefined {
  const declarations = new Map<string, Declaration>();
  for (const field of dependencyFields) {
    const dependencies = root[field];
    if (dependencies === undefined) continue;
    if (!isObject(dependencies)) return;
    for (const [name, range] of Object.entries(dependencies)) {
      if (typeof range !== "string") return;
      const ranges = declarations.get(name)?.ranges ?? {};
      // npm omits the production declaration when an optional declaration overrides it.
      if (field === "optionalDependencies") delete ranges.dependencies;
      ranges[field] = range;
      declarations.set(name, { ranges, effective: range });
    }
  }
  return declarations;
}

const plainRange = /^([~^]?)v?(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parsePlainRange(text: string) {
  const match = plainRange.exec(text.trim());
  if (!match) return;
  const [, operator, majorText, minorText, patchText, prereleaseText, build] = match;
  if (patchText === undefined && (!operator || prereleaseText || build)) return;
  const prerelease = prereleaseText?.split(".") ?? [];
  if (prerelease.some((id) => /^0\d+$/.test(id))) return;
  const major = Number(majorText);
  const minor = Number(minorText ?? 0);
  const patch = Number(patchText ?? 0);
  if (![major, minor, patch].every(Number.isSafeInteger)) return;
  return {
    operator, major, minor, patch, prerelease,
    hasMinor: minorText !== undefined,
    hasPatch: patchText !== undefined,
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0) return b.length === 0 ? 0 : 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) continue;
    const leftIsNumber = /^\d+$/.test(left);
    const rightIsNumber = /^\d+$/.test(right);
    if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
    if (leftIsNumber && left.length !== right.length) return left.length - right.length;
    return left < right ? -1 : 1;
  }
  return a.length - b.length;
}

function satisfies(wanted: string, locked: string | undefined): boolean {
  const range = parsePlainRange(wanted);
  if (!range) return true; // Other specifiers are checked against the lock root text.
  const version = locked === undefined ? undefined : parsePlainRange(locked);
  if (!version || version.operator) return false;

  const major = version.major - range.major;
  const minor = version.minor - range.minor;
  const patch = version.patch - range.patch;
  const core = major || minor || patch;
  const prerelease = comparePrerelease(version.prerelease, range.prerelease);
  if (!range.operator) return core === 0 && prerelease === 0;
  // A prerelease satisfies a range only if that range names the same base version's prerelease.
  if (version.prerelease.length && (core !== 0 || !range.prerelease.length)) return false;
  if ((core || prerelease) < 0 || major !== 0) return false;
  if (!range.hasMinor) return true;
  if (range.operator === "~") return minor === 0;
  if (range.major !== 0) return true;
  return minor === 0 && (range.minor !== 0 || !range.hasPatch || patch === 0);
}

function badInput(name: string): LockfileSyncResult {
  return { verdict: "stop", problems: [{ name, kind: "bad-input" }] };
}

/** Check direct dependency declarations and resolutions from the two npm JSON texts. */
export function lockfileSync(packageJsonText: string, lockfileText: string): LockfileSyncResult {
  const manifest = parseObject(packageJsonText);
  const wanted = manifest && readDependencies(manifest);
  if (!wanted) return badInput("package.json");

  const lockfile = parseObject(lockfileText);
  const { lockfileVersion, packages } = lockfile ?? {};
  if (typeof lockfileVersion !== "number" || !Number.isSafeInteger(lockfileVersion)
    || lockfileVersion < 2 || !isObject(packages)) {
    return badInput("package-lock.json");
  }

  // An empty project can omit the root entry.
  const root = packages[""] === undefined ? {} : packages[""];
  const declared = isObject(root) && readDependencies(root);
  if (!declared) return badInput("package-lock.json");

  const problems: LockfileSyncProblem[] = [];
  const names = new Set([...wanted.keys(), ...declared.keys()]);
  for (const name of [...names].sort()) {
    const expected = wanted.get(name);
    const recorded = declared.get(name);
    if (!expected && recorded) {
      problems.push({ name, kind: "missing-from-package", locked: recorded.effective });
      continue;
    }
    if (!expected) continue;
    const entry = packages[`node_modules/${name}`];
    if (!recorded || entry === undefined) {
      problems.push({ name, kind: "missing-from-lock", wanted: expected.effective });
      continue;
    }
    if (!isObject(entry) || (entry.version !== undefined && typeof entry.version !== "string")) {
      problems.push({ name, kind: "bad-input" });
      continue;
    }

    const differentField = dependencyFields.find((field) => expected.ranges[field] !== recorded.ranges[field]);
    if (differentField) {
      const problem: LockfileSyncProblem = { name, kind: "range-mismatch" };
      const wantedRange = expected.ranges[differentField];
      const lockedRange = recorded.ranges[differentField];
      if (wantedRange !== undefined) problem.wanted = wantedRange;
      if (lockedRange !== undefined) problem.locked = lockedRange;
      problems.push(problem);
    } else if (!satisfies(expected.effective, entry.version)) {
      const problem: LockfileSyncProblem = { name, kind: "range-mismatch", wanted: expected.effective };
      if (entry.version !== undefined) problem.locked = entry.version;
      problems.push(problem);
    }
  }
  return { verdict: problems.length === 0 ? "go" : "stop", problems };
}
