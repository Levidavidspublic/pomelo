import { toUSVString } from "node:util";
import { HIDDEN, hideSecretsIn } from "../../secrets.js";
import { canaryForms } from "../canary-sweep.js";
import { MASK } from "../mask.js";

type JobResultCell = string | number | boolean;
type JobResult =
  | { kind: "text"; text: string }
  | { kind: "table"; columns: string[]; rows: JobResultCell[][] };

export interface JobResultOptions {
  /** Code points of cleaned text, or of the serialized table result. */
  maxChars?: number;
  maxColumns?: number;
  maxRows?: number;
  knownSecrets?: readonly string[];
}

type JobResultCut = { rows: number; chars: number };
type CleanJobResult =
  | { ok: true; result: JobResult; cut: JobResultCut; note?: string }
  | { ok: false; code: "invalid-result" | "too-many-columns" | "headers-too-large"; message: string };

const DEFAULT_MAX_CHARS = 2_000;
const DEFAULT_MAX_COLUMNS = 12;
const DEFAULT_MAX_ROWS = 50;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const credentialLabel = /^(?:cookies?|set[ _-]cookie|password|passwd|passphrase|(?:proxy[ _-])?authorization)$/i;
const credentialAssignment = /\b(?:cookies?|password|passwd|passphrase|authorization)\b["']?[^\S\r\n]*[:=]/i;

function limit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function knownForms(secrets: readonly string[]): Set<string> {
  const forms = new Set<string>();
  for (const secret of new Set(secrets)) {
    if (!secret) continue;
    if ([...secret].length >= 8) {
      for (const { needle } of canaryForms(secret)) forms.add(needle);
    } else {
      // The sweep enforces a canary length minimum. Short known passwords still need redaction.
      const bytes = Buffer.from(secret);
      forms.add(secret);
      forms.add(JSON.stringify(secret).slice(1, -1));
      forms.add(encodeURIComponent(toUSVString(secret)));
      forms.add(bytes.toString("base64"));
      forms.add(bytes.toString("base64url"));
      forms.add(bytes.toString("hex"));
      forms.add(bytes.toString("hex").toUpperCase());
    }
  }
  return forms;
}

function charCount(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}

function cutText(text: string, maxChars: number): { text: string; omitted: number } {
  let count = 0;
  let end = 0;
  for (const character of text) {
    if (count < maxChars) end += character.length;
    count++;
  }
  if (count <= maxChars) return { text, omitted: 0 };

  end = graphemes.segment(text).containing(end)?.index ?? end;
  for (const marker of [MASK, HIDDEN]) {
    if (end === 0) break;
    const start = text.lastIndexOf(marker, end - 1);
    if (start !== -1 && start + marker.length > end) end = start;
  }
  const kept = text.slice(0, end);
  return { text: kept, omitted: count - charCount(kept) };
}

function invalidResult(): CleanJobResult {
  return { ok: false, code: "invalid-result", message: "The job must return nonempty text or a table with valid rows." };
}

function success(result: JobResult, cut: JobResultCut): CleanJobResult {
  const omissions: string[] = [];
  if (cut.rows > 0) omissions.push(`${cut.rows} ${cut.rows === 1 ? "row" : "rows"}`);
  if (cut.chars > 0) omissions.push(`${cut.chars} ${cut.chars === 1 ? "character" : "characters"}`);
  return { ok: true, result, cut, ...(omissions.length > 0 ? { note: `${omissions.join(" and ")} omitted.` } : {}) };
}

/** Prepare findings for the thread using only the supplied result and options. */
export function cleanJobResult(input: unknown, options: JobResultOptions = {}): CleanJobResult {
  if (input === null || typeof input !== "object" || !("kind" in input)) return invalidResult();

  const maxChars = limit(options.maxChars, DEFAULT_MAX_CHARS);
  const forms = knownForms(options.knownSecrets ?? []);
  function cleanString(text: string, credential = false): string {
    const shielded = hideSecretsIn(text);
    if (text.includes(MASK)) return MASK;
    if (credential || credentialAssignment.test(text)) return HIDDEN;
    // Remove the whole string on a known hit, including any partial base64 groups around an aligned hit.
    for (const form of forms) {
      if (text.includes(form) || (shielded !== text && shielded.includes(form))) return HIDDEN;
    }
    return shielded;
  }

  if (input.kind === "text") {
    if (!("text" in input) || typeof input.text !== "string" || !input.text.trim()) return invalidResult();
    const { text, omitted } = cutText(cleanString(input.text), maxChars);
    return success({ kind: "text", text }, { rows: 0, chars: omitted });
  }

  if (input.kind !== "table" || !("columns" in input) || !("rows" in input)
    || !Array.isArray(input.columns) || !Array.isArray(input.rows)
    || input.columns.length === 0 || input.rows.length === 0) return invalidResult();

  if (input.columns.length > limit(options.maxColumns, DEFAULT_MAX_COLUMNS)) {
    return { ok: false, code: "too-many-columns", message: "The job table has too many columns." };
  }

  const rawColumns: unknown[] = Array.from(input.columns);
  if (!rawColumns.every((column) => typeof column === "string")) return invalidResult();
  const columns = rawColumns.map((column) => cleanString(column));
  const credentialColumns = rawColumns.map((column) => credentialLabel.test(column.trim()));
  const rows: JobResultCell[][] = [];
  const result = { kind: "table", columns, rows } as const;
  let used = charCount(JSON.stringify(result));
  if (used > maxChars) {
    return { ok: false, code: "headers-too-large", message: "The job table headers exceed the size limit." };
  }

  const maxRows = limit(options.maxRows, DEFAULT_MAX_ROWS);
  const cut = { rows: 0, chars: 0 };
  const rawRows: unknown[] = input.rows;
  for (const rawRow of rawRows) {
    if (!Array.isArray(rawRow) || rawRow.length !== columns.length) return invalidResult();
    const row: JobResultCell[] = [];
    for (const [index, cell] of rawRow.entries()) {
      const credential = credentialColumns[index];
      if (typeof cell === "string") row.push(cleanString(cell, credential));
      else if (typeof cell === "boolean" || (typeof cell === "number" && Number.isFinite(cell))) {
        row.push(credential ? HIDDEN : cell);
      } else return invalidResult();
    }
    const size = charCount(JSON.stringify(row)) + (rows.length + cut.rows > 0 ? 1 : 0);
    if (cut.rows > 0 || rows.length >= maxRows || used + size > maxChars) {
      cut.rows++;
      cut.chars += size;
    } else {
      rows.push(row);
      used += size;
    }
  }
  return success(result, cut);
}
