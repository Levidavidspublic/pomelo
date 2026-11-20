import { canaryForms } from "./canary-sweep.js";
import type { CanaryHitPlace, CanaryScanResult } from "./canary-verdict.js";

const ANSI_SEQUENCE = /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|(?:\x1b\]|\x9d)[^\x07\x1b\x9b\x9c\x9d\r\n]*(?:\x07|\x1b\\|\x9c)/g;
const OMITTED_NAME = "[name omitted]";

interface CanaryLogScanResult extends CanaryScanResult {
  surface: "logs";
  hitPlaces: Extract<CanaryHitPlace, { file: string }>[];
  forms: string[];
}

/** Scan captured logs and report each matching physical line once. */
export function scanLogsForCanary(canary: string, sources: Record<string, string>): CanaryLogScanResult {
  const needles = canaryForms(canary);
  const containsCanary = (text: string) => needles.some(({ needle }) => text.includes(needle));
  const isSafeName = (name: string) =>
    !containsCanary(name) &&
    !containsCanary(JSON.stringify(name)) &&
    !containsCanary(name.replace(ANSI_SEQUENCE, ""));
  const omittedName = isSafeName(OMITTED_NAME) ? OMITTED_NAME : "";
  const hitPlaces: CanaryLogScanResult["hitPlaces"] = [];
  const forms = new Set<string>();
  let itemsScanned = 0;

  for (const [name, text] of Object.entries(sources)) {
    if (text === "") continue;

    const rawLines = text.split(/\r\n|\n|\r/);
    if (rawLines.at(-1) === "") rawLines.pop();
    const lines = rawLines.map((line) => line.replace(ANSI_SEQUENCE, ""));
    itemsScanned += lines.length;
    let file: string | undefined;

    for (const [index, line] of lines.entries()) {
      const next = lines[index + 1];
      const joined = next ? line + next : undefined;
      let hit = false;
      for (const { form, needle } of needles) {
        let matched = line.includes(needle);
        if (!matched && joined !== undefined) {
          // Only matches that cross the break belong to this pair.
          const start = Math.max(0, line.length - needle.length + 1);
          const at = joined.indexOf(needle, start);
          matched = at !== -1 && at < line.length;
        }
        if (!matched) continue;

        forms.add(form);
        hit = true;
      }
      if (hit) {
        file ??= isSafeName(name) ? name : omittedName;
        hitPlaces.push({ file, line: index + 1 });
      }
    }
  }

  return { surface: "logs", ran: itemsScanned > 0, itemsScanned, hitCount: hitPlaces.length, hitPlaces, forms: [...forms] };
}
