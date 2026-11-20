import type { ToolbarKind } from "./artifact-toolbar.js";

export type VersionCompareOptions = {
  kind: ToolbarKind;
  /** Maximum number of lines per body, up to the model's ceiling of 1,000. */
  maxLines: number;
};

export type VersionCompareRow =
  | { type: "same"; content: string; oldLine: number; newLine: number }
  | { type: "added"; content: string; oldLine?: never; newLine: number }
  | { type: "removed"; content: string; oldLine: number; newLine?: never }
  /** Line numbers point to the start of the hidden run. */
  | { type: "fold"; content: string; count: number; oldLine: number; newLine: number };

export type VersionCompareResult =
  | { status: "ready"; rows: VersionCompareRow[]; added: number; removed: number; summary: string }
  | { status: "fallback"; rows: []; reason: string };

const CONTEXT_LINES = 3;
const MAX_COMPARE_LINES = 1_000;
const MAX_BODY_CODE_UNITS = 256 * 1024;
const TOO_LARGE = "This artifact is too large to compare.";

function splitLines(body: string): string[] {
  if (body === "") return [];
  // Keep enough parts to detect an oversized body even after removing the final empty part.
  const lines = body.split(/\r\n|\r|\n/, MAX_COMPARE_LINES + 2);
  // A final line ending terminates the last line.
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function foldUnchangedRows(rows: VersionCompareRow[]): VersionCompareRow[] {
  const folded: VersionCompareRow[] = [];
  let start = 0;
  while (start < rows.length) {
    const first = rows[start];
    if (first.type !== "same") {
      folded.push(first);
      start++;
      continue;
    }

    let end = start + 1;
    while (end < rows.length && rows[end].type === "same") end++;
    const leadingContext = start > 0 ? CONTEXT_LINES : 0;
    const trailingContext = end < rows.length ? CONTEXT_LINES : 0;
    const hiddenStart = start + leadingContext;
    const hiddenEnd = end - trailingContext;
    const count = hiddenEnd - hiddenStart;

    if (end - start <= 2 * CONTEXT_LINES || count <= 1) {
      folded.push(...rows.slice(start, end));
    } else {
      folded.push(...rows.slice(start, hiddenStart), {
        type: "fold",
        content: `${count} unchanged lines`,
        count,
        oldLine: first.oldLine + leadingContext,
        newLine: first.newLine + leadingContext,
      }, ...rows.slice(hiddenEnd, end));
    }
    start = end;
  }
  return folded;
}

export function compareVersions(oldBody: string, newBody: string, options: VersionCompareOptions): VersionCompareResult {
  if (options.kind === "image") {
    return { status: "fallback", rows: [], reason: "Images cannot be compared line by line." };
  }
  if (oldBody.length > MAX_BODY_CODE_UNITS || newBody.length > MAX_BODY_CODE_UNITS) {
    return { status: "fallback", rows: [], reason: TOO_LARGE };
  }

  const oldLines = splitLines(oldBody);
  const newLines = splitLines(newBody);
  const lineLimit = Math.min(options.maxLines, MAX_COMPARE_LINES);
  if (!(Math.max(oldLines.length, newLines.length) <= lineLimit)) {
    return { status: "fallback", rows: [], reason: TOO_LARGE };
  }

  // Compare numeric IDs in the table so long lines are examined only while building the lookup.
  const lineIds = new Map(oldLines.map((line, index) => [line, index] as const));
  const oldIds = oldLines.map((line) => lineIds.get(line));
  const newIds = newLines.map((line) => lineIds.get(line));

  // Each cell stores the length of the longest common subsequence from that pair of lines onward.
  const stride = newLines.length + 1;
  const lengths = new Uint16Array((oldLines.length + 1) * stride);
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex--) {
      const cell = oldIndex * stride + newIndex;
      lengths[cell] = oldIds[oldIndex] === newIds[newIndex]
        ? 1 + lengths[cell + stride + 1]
        : Math.max(lengths[cell + stride], lengths[cell + 1]);
    }
  }

  const rows: VersionCompareRow[] = [];
  let added = 0;
  let removed = 0;
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldIndex + 1;
    const newLine = newIndex + 1;
    const oldContent = oldLines[oldIndex];
    const newContent = newLines[newIndex];
    const cell = oldIndex * stride + newIndex;

    if (oldContent !== undefined && oldContent === newContent) {
      rows.push({ type: "same", content: oldContent, oldLine, newLine });
      oldIndex++;
      newIndex++;
    } else if (oldContent !== undefined && (newContent === undefined || lengths[cell + stride] >= lengths[cell + 1])) {
      // On ties, show removals first so a replacement reads in version order.
      rows.push({ type: "removed", content: oldContent, oldLine });
      oldIndex++;
      removed++;
    } else {
      rows.push({ type: "added", content: newContent, newLine });
      newIndex++;
      added++;
    }
  }

  const summary = added === 0 && removed === 0
    ? "No changes"
    : `${added} ${added === 1 ? "line" : "lines"} added, ${removed} removed`;
  return { status: "ready", rows: foldUnchangedRows(rows), added, removed, summary };
}
