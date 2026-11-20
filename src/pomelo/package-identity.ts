type PackageIdentityChange = {
  field: string;
  kind: "added" | "removed" | "changed" | "unreadable";
  reason: string;
};

type PackageIdentityResult = {
  ok: boolean;
  changes: PackageIdentityChange[];
};

const guardedFields = [
  "name", "version", "license", "bin", "files", "repository", "homepage",
  "private", "publishConfig", "author", "build",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parseManifest(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (isObject(value) && !Array.isArray(value)) return value;
  } catch {
    // The finding identifies the input without echoing any of its contents.
  }
}

function equalJson(baseValue: unknown, headValue: unknown): boolean {
  const pending: Array<[unknown, unknown]> = [[baseValue, headValue]];
  let pair = pending.pop();
  while (pair !== undefined) {
    const [base, head] = pair;
    if (base !== head) {
      if (!isObject(base) || !isObject(head) || Array.isArray(base) !== Array.isArray(head)) {
        return false;
      }

      const keys = Object.keys(base);
      if (keys.length !== Object.keys(head).length) return false;
      // JSON arrays have a key at every index, so comparing by key preserves their order.
      for (const key of keys) {
        if (!Object.hasOwn(head, key)) return false;
        pending.push([base[key], head[key]]);
      }
    }
    pair = pending.pop();
  }
  return true;
}

export function checkPackageIdentity(baseText: string, headText: string): PackageIdentityResult {
  const base = parseManifest(baseText);
  const head = parseManifest(headText);
  if (!base || !head) {
    const side = base ? "head" : head ? "base" : "base and head";
    return {
      ok: false,
      changes: [{ field: `package.json (${side})`, kind: "unreadable", reason: "Expected a JSON object." }],
    };
  }

  const changes: PackageIdentityChange[] = [];
  for (const field of guardedFields) {
    const baseValue = Object.hasOwn(base, field) ? base[field] : undefined;
    const headValue = Object.hasOwn(head, field) ? head[field] : undefined;
    if (equalJson(baseValue, headValue)) continue;

    const kind = baseValue === undefined ? "added" : headValue === undefined ? "removed" : "changed";
    let reason = `The package.json field "${field}" was ${kind}.`;
    if (field === "license" && (baseValue === "MIT" || kind === "removed")) {
      reason = "Friday's MIT licence must stay.";
    } else if (
      (field === "publishConfig" && kind === "added") ||
      (field === "private" && (kind === "removed" || headValue === false))
    ) {
      reason = "The fork must not be publishable to npm.";
    }
    changes.push({ field, kind, reason });
  }
  return { ok: changes.length === 0, changes };
}
