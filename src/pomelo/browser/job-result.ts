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
// A cookie header starts with a name=value pair. A colon in prose alone is ambiguous.
const cookieHeader = /(\b(?:set[ _-])?cookies?["']?[ \t]*[:=][ \t]*["']?)[^\s"'=;,:]+=[^\s"';,]*(?:;[ \t]*[^\s"'=;,:]+=[^\s"';,]*)*/gi;
const credentialAssignment = /(\b(?:(?:set[ _-])?cookies?|password|passwd|passphrase|(?:proxy[ _-])?authorization)["']?[ \t]*=[ \t]*)(?:\[secret hidden\]|"(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*'|[^\s"',;)}\]]+)/gi;
const labeledPassword = /((?:^|[\s"',;({])(?:password|passwd|passphrase)["']?[ \t]*:[ \t]*)(?:"(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*'|[^\s"',;(){}\]]+(?=[ \t]*(?:$|[,;)}\]])))/gim;

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

function success(result: JobResult, cut: JobResultCut, hiddenValues: number): CleanJobResult {
  const omissions: string[] = [];
  if (cut.rows > 0) omissions.push(`${cut.rows} ${cut.rows === 1 ? "row" : "rows"}`);
  if (cut.chars > 0) omissions.push(`${cut.chars} ${cut.chars === 1 ? "character" : "characters"}`);
  const notes: string[] = [];
  if (omissions.length > 0) notes.push(`${omissions.join(" and ")} omitted.`);
  if (hiddenValues > 0) notes.push(`${hiddenValues} ${hiddenValues === 1 ? "value" : "values"} hidden.`);
  return { ok: true, result, cut, ...(notes.length > 0 ? { note: notes.join(" ") } : {}) };
}

/** Prepare findings for the thread using only the supplied result and options. */
export function cleanJobResult(input: unknown, options: JobResultOptions = {}): CleanJobResult {
  if (input === null || typeof input !== "object" || !("kind" in input)) return invalidResult();

  const maxChars = limit(options.maxChars, DEFAULT_MAX_CHARS);
  const forms = knownForms(options.knownSecrets ?? []);
  let hiddenValues = 0;
  function hideValue(value: JobResultCell, marker: string = HIDDEN): string {
    if (value !== marker) hiddenValues++;
    return marker;
  }

  function cleanString(text: string, credential = false): string {
    const shielded = hideSecretsIn(text
      .replace(cookieHeader, "$1" + HIDDEN)
      .replace(credentialAssignment, "$1" + HIDDEN)
      .replace(labeledPassword, "$1" + HIDDEN));
    if (text.includes(MASK)) return hideValue(text, MASK);
    if (credential) return hideValue(text);
    // Remove the whole string on a known hit, including any partial base64 groups around an aligned hit.
    for (const form of forms) {
      if (text.includes(form) || (shielded !== text && shielded.includes(form))) return hideValue(text);
    }
    return shielded;
  }

  if (input.kind === "text") {
    if (!("text" in input) || typeof input.text !== "string" || !input.text.trim()) return invalidResult();
    const { text, omitted } = cutText(cleanString(input.text), maxChars);
    if (!text.trim()) return invalidResult();
    return success({ kind: "text", text }, { rows: 0, chars: omitted }, hiddenValues);
  }

  if (input.kind !== "table" || !("columns" in input) || !("rows" in input)
    || !Array.isArray(input.columns) || !Array.isArray(input.rows)
    || input.columns.length === 0 || input.rows.length === 0) return invalidResult();

  if (input.columns.length > limit(options.maxColumns, DEFAULT_MAX_COLUMNS)) {
    return { ok: false, code: "too-many-columns", message: "The job table has too many columns." };
  }

  const columns: string[] = [];
  const credentialColumns: boolean[] = [];
  const rawColumns: unknown[] = input.columns;
  for (const column of rawColumns) {
    if (typeof column !== "string") return invalidResult();
    columns.push(cleanString(column));
    credentialColumns.push(credentialLabel.test(column.trim()));
  }
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
    const previouslyHidden = hiddenValues;
    const row: JobResultCell[] = [];
    for (const [index, cell] of rawRow.entries()) {
      const credential = credentialColumns[index];
      if (typeof cell === "string") row.push(cleanString(cell, credential));
      else if (typeof cell === "boolean" || (typeof cell === "number" && Number.isFinite(cell))) {
        row.push(credential ? hideValue(cell) : cell);
      } else return invalidResult();
    }
    const size = charCount(JSON.stringify(row)) + (rows.length + cut.rows > 0 ? 1 : 0);
    if (cut.rows > 0 || rows.length >= maxRows || used + size > maxChars) {
      cut.rows++;
      cut.chars += size;
      hiddenValues = previouslyHidden;
    } else {
      rows.push(row);
      used += size;
    }
  }
  if (rows.length === 0) return invalidResult();
  return success(result, cut, hiddenValues);
}
