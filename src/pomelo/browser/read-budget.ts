export const DEFAULT_PAGE_READ_BUDGET = 8_000;

export interface PageReadLine {
  /** The element's structural role. */
  role: string;
  /** The complete, already-masked line as rendered for the model. */
  text: string;
  secret?: boolean;
}

export interface PageReadBudgetInput {
  lines: readonly PageReadLine[];
  maxChars?: number;
  /** The marker used by the upstream mask layer, typically `MASK` from ../mask.js. */
  maskMarker: string;
}

export type PageReadBudgetResult =
  | { lines: PageReadLine[]; dropped: number; truncated: boolean; note: string | null }
  | { ok: false; reason: "unmasked-line" };

function charCount(text: string, limit: number): number {
  // A code point uses at most two UTF-16 units. Avoid allocating an array for obviously oversized strings.
  return text.length > 2 * limit ? Infinity : Array.from(text).length;
}

/** Budget the rendered lines and their newline separators. The summary note is separate metadata. */
export function trimPageRead({ lines, maxChars = DEFAULT_PAGE_READ_BUDGET, maskMarker }: PageReadBudgetInput): PageReadBudgetResult {
  // Validate the entire read, including any lines that will fall outside the budget.
  if (lines.some((line) => line.secret === true && (maskMarker === "" || !line.text.includes(maskMarker)))) {
    return { ok: false, reason: "unmasked-line" };
  }

  const limit = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : DEFAULT_PAGE_READ_BUDGET;
  const kept: PageReadLine[] = [];
  let used = 0;
  let roleOnly = 0;
  for (const line of lines) {
    let length = charCount(line.text, limit);
    const oversized = length > limit;
    if (oversized) length = charCount(line.role, limit);

    const separator = kept.length === 0 ? 0 : 1;
    if (used + separator + length > limit) break;

    if (oversized) {
      kept.push({ role: line.role, text: line.role });
      roleOnly++;
    } else {
      kept.push(line);
    }
    used += separator + length;
  }

  const dropped = lines.length - kept.length;
  const notes: string[] = [];
  if (dropped > 0) notes.push(`${dropped} more ${dropped === 1 ? "element" : "elements"} not shown`);
  if (roleOnly > 0) notes.push(`${roleOnly} ${roleOnly === 1 ? "element" : "elements"} shown by role only`);
  return {
    lines: kept,
    dropped,
    truncated: notes.length > 0,
    note: notes.length > 0 ? `…${notes.join(". ")}` : null,
  };
}
