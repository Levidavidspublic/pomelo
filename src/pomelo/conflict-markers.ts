export type ConflictMarkerLine = {
  readonly line: number;
  readonly text: string;
};

export type ConflictMarkerFile = {
  readonly path: string;
  readonly addedLines: readonly ConflictMarkerLine[];
};

export type ConflictMarkerKind = "ours" | "base" | "split" | "theirs";

export type ConflictMarkerHit = {
  path: string;
  line: number;
  kind: ConflictMarkerKind;
};

export type ConflictMarkerResult = {
  ok: boolean;
  hits: ConflictMarkerHit[];
  reason?: string;
};

const ours = "<".repeat(7);
const base = "|".repeat(7);
const split = "=".repeat(7);
const theirs = ">".repeat(7);

function markerKind(text: string): ConflictMarkerKind | undefined {
  if (text.startsWith(ours)) return "ours";
  if (text.startsWith(base)) return "base";
  if (text === split) return "split";
  if (text.startsWith(theirs)) return "theirs";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Check the added lines of each file in a diff. */
export function findConflictMarkers(files: unknown): ConflictMarkerResult {
  if (!Array.isArray(files)) {
    return { ok: false, hits: [], reason: "Expected an array of files." };
  }

  const candidates: ConflictMarkerHit[] = [];
  const filesWithBoundary = new Set<string>();
  for (const file of files as readonly unknown[]) {
    if (!isRecord(file) || typeof file.path !== "string" || !file.path || !Array.isArray(file.addedLines)) {
      return { ok: false, hits: [], reason: "Expected each file to have a path and an array of added lines." };
    }

    for (const addedLine of file.addedLines as readonly unknown[]) {
      if (!isRecord(addedLine) || typeof addedLine.line !== "number" || !Number.isSafeInteger(addedLine.line)
        || addedLine.line < 1 || typeof addedLine.text !== "string") {
        return { ok: false, hits: [], reason: "Expected each added line to have a positive integer line number and text." };
      }

      const kind = markerKind(addedLine.text);
      if (!kind) continue;
      candidates.push({ path: file.path, line: addedLine.line, kind });
      if (kind === "ours" || kind === "theirs") filesWithBoundary.add(file.path);
    }
  }

  // A Markdown heading underline also looks like a split.
  const hits = candidates.filter(({ path, kind }) => kind !== "split" || filesWithBoundary.has(path));
  return { ok: hits.length === 0, hits };
}
