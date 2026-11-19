import { canaryForms } from "./canary-sweep.js";

const MAX_DEPTH = 64;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const ARRAY_INDEX = /^(0|[1-9]\d*)$/;

type List = "model" | "bus";
type Location = { list: List; index: number; path: string };
type SkipReason = "cycle" | "too-deep" | "accessor";
type ScanResult = {
  hits: (Location & { form: string })[];
  skipped: (Location & { reason: SkipReason })[];
};

function startsNestedJson(text: string): boolean {
  const first = text.trimStart()[0];
  return first === "{" || first === "[" || first === '"';
}

function parseNestedJson(text: string): unknown {
  if (!startsNestedJson(text)) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Report each matching form at its field path. List indexes and [#n] property positions
 * are zero-based. Secret-bearing and JSON-like property names use positions. Key hits
 * end in " (key)".
 */
export function scanEventsForCanary(
  canary: string,
  { modelInput, busEvents }: { modelInput: readonly object[]; busEvents: readonly object[] },
): ScanResult {
  const forms = canaryForms(canary);
  const result: ScanResult = { hits: [], skipped: [] };
  const containsCanary = (text: string) => forms.some(({ needle }) => text.includes(needle));
  const isSafePath = (path: string) => !containsCanary(path) && !containsCanary(JSON.stringify(path));

  function scanItem(item: object, list: List, index: number): void {
    const ancestors = new WeakSet<object>();
    const location = (path: string): Location => ({ list, index, path: isSafePath(path) ? path : "…" });
    const skip = (path: string, reason: SkipReason) => result.skipped.push({ ...location(path), reason });

    function walk(value: unknown, path: string, depth: number, seenForms?: Set<string>): void {
      if (depth > MAX_DEPTH) {
        skip(path, "too-deep");
        return;
      }

      if (typeof value === "string") {
        const matched = seenForms ?? new Set<string>();
        for (const { form, needle } of forms) {
          if (value.includes(needle) && !matched.has(form)) {
            result.hits.push({ ...location(path), form });
            matched.add(form);
          }
        }
        const parsed = parseNestedJson(value);
        if (parsed !== undefined) walk(parsed, path, depth + 1, matched);
        return;
      }

      if (value === null || typeof value !== "object") return;
      if (ancestors.has(value)) {
        skip(path, "cycle");
        return;
      }

      ancestors.add(value);
      const array = Array.isArray(value);
      for (const [position, key] of Object.getOwnPropertyNames(value).entries()) {
        if (array && key === "length") continue;
        const arrayIndex = array && ARRAY_INDEX.test(key) && Number(key) < value.length;
        let namedPath = `${path}[${JSON.stringify(key)}]`;
        if (arrayIndex) namedPath = `${path}[${key}]`;
        else if (IDENTIFIER.test(key)) namedPath = path ? `${path}.${key}` : key;

        // A JSON key can reveal the canary only after decoding, so withhold the entire key.
        const fieldPath = startsNestedJson(key) || containsCanary(key) || !isSafePath(namedPath)
          ? `${path}[#${position}]`
          : namedPath;
        if (!arrayIndex) walk(key, `${fieldPath} (key)`, depth);

        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if ("value" in descriptor) walk(descriptor.value, fieldPath, depth + 1);
        else skip(fieldPath, "accessor");
      }
      ancestors.delete(value);
    }

    walk(item, "", 0);
  }

  modelInput.forEach((item, index) => scanItem(item, "model", index));
  busEvents.forEach((item, index) => scanItem(item, "bus", index));
  return result;
}
