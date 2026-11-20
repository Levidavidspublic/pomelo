export const REPLY_TABLE_ROW_LIMIT = 12;
export const REPLY_TABLE_COLUMN_LIMIT = 4;
export const REPLY_TABLE_CELL_CHAR_LIMIT = 40;

export type TableDirection = "ltr" | "rtl";
export type TableCellDirection = "ltr" | "auto";

export interface TableViewInput {
  header: readonly string[];
  rows: readonly (readonly string[])[];
  messageDir: TableDirection | "auto";
  expanded?: boolean;
}

export interface TableCell {
  text: string;
  cellDir: TableCellDirection;
}

export interface TableView {
  dir: TableDirection;
  header: TableCell[];
  visibleRows: TableCell[][];
  hiddenCount: number;
  showAllLabel: string;
  scrollsSideways: boolean;
  summary: string;
}

const NUMBER = /^[+\-−]?(?:\p{Nd}+(?:[.,\u066B\u066C\u00A0\u202F]\p{Nd}+)*|[.,\u066B]\p{Nd}+)(?:e[+\-−]?\p{Nd}+)?%?$/iu;
const DATE = /^(?:\d{4}([-/.])\d{1,2}\1\d{1,2}|\d{1,2}([-/.])\d{1,2}\2(?:\d{2}|\d{4}))$/;
const PATH = /^(?:[a-z]:)?(?:[^\s\\/:]*[\\/])+[^\s\\/:]*$/i;
// Match the first complete Markdown code span or fence so surrounding prose can keep auto direction.
const CODE_SPAN = /^(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/;
const CODE_FENCE = /^((`|~)\2{2,})(?!\2)[^\r\n]*\r?\n[\s\S]*?^ {0,3}\1\2*[ \t]*$/m;
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

function cellView(text: string): TableCell {
  const value = text.trim();
  const isLtr = NUMBER.test(value) || DATE.test(value) || PATH.test(value) ||
    value.match(CODE_SPAN)?.[0] === value || value.match(CODE_FENCE)?.[0] === value;
  return { text, cellDir: isLtr ? "ltr" : "auto" };
}

function isLongCell(text: string): boolean {
  if (text.length <= REPLY_TABLE_CELL_CHAR_LIMIT) return false;
  let count = 0;
  for (const _ of graphemes.segment(text)) {
    if (++count > REPLY_TABLE_CELL_CHAR_LIMIT) return true;
  }
  return false;
}

export function tableView({ header, rows, messageDir, expanded = false }: TableViewInput): TableView | null {
  let columnCount = header.length;
  for (const row of rows) columnCount = Math.max(columnCount, row.length);
  if (columnCount === 0) return null;

  const toCells = (row: readonly string[]) =>
    Array.from({ length: columnCount }, (_, index) => cellView(row[index] ?? ""));
  const rowCount = rows.length;
  const visibleCount = expanded ? rowCount : Math.min(rowCount, REPLY_TABLE_ROW_LIMIT);
  const hiddenCount = rowCount - visibleCount;
  const headings = header.map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean);
  const columnsLabel = columnCount === 1 ? "column" : "columns";
  const rowsLabel = rowCount === 1 ? "row" : "rows";
  const dimensions = `Table, ${columnCount} ${columnsLabel}, ${rowCount} ${rowsLabel}`;

  return {
    dir: messageDir === "rtl" ? "rtl" : "ltr",
    header: toCells(header),
    visibleRows: rows.slice(0, visibleCount).map(toCells),
    hiddenCount,
    showAllLabel: hiddenCount ? `Show all ${rowCount} rows` : "",
    scrollsSideways: columnCount > REPLY_TABLE_COLUMN_LIMIT ||
      header.some(isLongCell) || rows.some((row) => row.some(isLongCell)),
    summary: headings.length ? `${dimensions}: ${headings.join(", ")}` : dimensions,
  };
}
