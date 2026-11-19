import { isDeepStrictEqual } from "node:util";

export type ScriptFinding = {
  field: string;
  change: "added" | "removed" | "changed" | "unreadable";
  level: "blocking" | "review";
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

function parseManifest(text: string): Record<string, unknown> | undefined {
  try {
    return asObject(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function ownValue(object: Record<string, unknown> | undefined, key: string): unknown {
  return object && Object.hasOwn(object, key) ? object[key] : undefined;
}

function guardedFields(manifest: Record<string, unknown>): Map<string, unknown> {
  const fields = new Map<string, unknown>();
  const scripts = asObject(ownValue(manifest, "scripts"));
  for (const [name, command] of Object.entries(scripts ?? {})) {
    fields.set(`scripts.${name}`, command);
  }

  const engines = asObject(ownValue(manifest, "engines"));
  fields.set("engines.node", ownValue(engines, "node"));
  for (const field of ["type", "main", "bin"]) {
    fields.set(field, ownValue(manifest, field));
  }
  return fields;
}

export function scriptGuard(beforeText: string, afterText: string): ScriptFinding[] {
  const before = parseManifest(beforeText);
  const after = parseManifest(afterText);
  if (!before || !after) {
    const side = before ? "after" : after ? "before" : "before and after";
    return [{ field: `package.json (${side})`, change: "unreadable", level: "blocking" }];
  }

  const beforeFields = guardedFields(before);
  const afterFields = guardedFields(after);
  const fields = new Set([...beforeFields.keys(), ...afterFields.keys()]);
  const findings: ScriptFinding[] = [];
  for (const field of [...fields].sort()) {
    const oldValue = beforeFields.get(field);
    const newValue = afterFields.get(field);
    if (isDeepStrictEqual(oldValue, newValue)) continue;

    const change = oldValue === undefined ? "added" : newValue === undefined ? "removed" : "changed";
    const level = field === "scripts.test" || field === "scripts.typecheck" ? "blocking" : "review";
    findings.push({ field, change, level });
  }
  return findings;
}
