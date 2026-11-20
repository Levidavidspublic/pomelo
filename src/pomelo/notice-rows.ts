export type NoticeRowReason =
  | "no-name"
  | "no-licence"
  | "no-source"
  | "listed-twice"
  | "empty-file"
  | "friday-missing";

export type NoticeRowProblem = { line: number; package?: string; reason: NoticeRowReason };
export type NoticeRowsResult = { ok: boolean; problems: NoticeRowProblem[] };

type NoticeRow = { line: number; name: string; licence: string; hasSource: boolean };
type NoticeColumns = { name: number; licence: number; source: number };

function tableCells(line: string): string[] | undefined {
  const text = line.trim();
  const cells: string[] = [];
  let start = 0;

  for (const match of text.matchAll(/\\[\\|]|\|/g)) {
    if (match[0] !== "|") continue;
    if (match.index > 0) cells.push(text.slice(start, match.index));
    start = match.index + 1;
  }

  if (start === 0) return undefined;
  if (start < text.length) cells.push(text.slice(start));
  return cells.map((cell) => cell.trim().replaceAll("\\|", "|"));
}

function noticeColumns(header: string[], divider: string[] | undefined): NoticeColumns | undefined {
  if (divider?.length !== header.length || !divider.every((cell) => /^:?-+:?$/.test(cell))) return undefined;

  const labels = header.map((label) => label.toLowerCase());
  const name = labels.findIndex((label) => /^(package(?: name)?|name)$/.test(label));
  const licence = labels.findIndex((label) => /^licen[cs]e$/.test(label));
  const source = labels.indexOf("source");
  // Recognize a notice table even if one of its required columns was removed.
  if ([name, licence, source].filter((column) => column >= 0).length < 2) return undefined;
  return { name, licence, source };
}

function noticeValue(value: string): string {
  return value.trim().replace(/^(`|\*\*|__)(.*?)\1$/, "$2").trim();
}

function readNoticeRows(text: string): NoticeRow[] {
  const lines = text.split(/\r?\n/);
  const rows: NoticeRow[] = [];
  let block: NoticeRow | undefined;
  let columns: NoticeColumns | undefined;
  let fence: string | undefined;
  let inComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    if (!fence) {
      if (inComment) {
        const end = line.indexOf("-->");
        if (end < 0) continue;
        line = line.slice(end + 3);
        inComment = false;
      }
      line = line.replace(/<!--.*?-->/g, "");
      const start = line.indexOf("<!--");
      if (start >= 0) {
        inComment = true;
        line = line.slice(0, start);
      }
    }

    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const [, marker, rest] = fenceMatch;
      if (!fence) fence = marker;
      else if (marker.startsWith(fence) && rest.trim() === "") fence = undefined;
      columns = undefined;
      continue;
    }
    if (fence) continue;

    const heading = /^ {0,3}##(?=[ \t]|$)(.*)$/.exec(line);
    if (heading) {
      columns = undefined;
      const title = heading[1].replace(/(?:^|[ \t])#+[ \t]*$/, "").trim();
      const entry = /^(.*?)\(([^()]*)\)$/.exec(title);
      block = {
        line: index + 1,
        name: noticeValue(entry?.[1] ?? title),
        licence: noticeValue(entry?.[2] ?? ""),
        hasSource: false,
      };
      rows.push(block);
      continue;
    }
    if (/^ {0,3}#(?:[ \t]|$)/.test(line)) {
      columns = undefined;
      block = undefined;
      continue;
    }

    const cells = tableCells(line);
    if (cells && columns) {
      rows.push({
        line: index + 1,
        name: noticeValue(cells[columns.name] ?? ""),
        licence: noticeValue(cells[columns.licence] ?? ""),
        hasSource: Boolean(noticeValue(cells[columns.source] ?? "")),
      });
      continue;
    }
    columns = undefined;
    if (cells) {
      columns = noticeColumns(cells, tableCells(lines[index + 1] ?? ""));
      if (columns) {
        block = undefined;
        index += 1;
        continue;
      }
    }

    // Heading entries cite an upstream URL in their body, alongside any local licence links.
    if (block && /https?:\/\/[^\s<>()`]+/i.test(line)) block.hasSource = true;
  }

  return rows;
}

/** Checks Markdown notice entries. Document-wide problems use line 1. */
export function checkNoticeRows(text: string): NoticeRowsResult {
  if (!text.trim()) return { ok: false, problems: [{ line: 1, reason: "empty-file" }] };

  const problems: NoticeRowProblem[] = [];
  const seen = new Set<string>();
  let hasFridayMit = false;

  for (const row of readNoticeRows(text)) {
    const entry = row.name ? { line: row.line, package: row.name } : { line: row.line };
    const name = row.name.toLowerCase().replace(/\s+/g, " ");

    if (!name) problems.push({ ...entry, reason: "no-name" });
    if (!row.licence) problems.push({ ...entry, reason: "no-licence" });
    if (!row.hasSource) problems.push({ ...entry, reason: "no-source" });
    if (name) {
      if (seen.has(name)) problems.push({ ...entry, reason: "listed-twice" });
      seen.add(name);
    }
    if (name === "friday" && row.licence.toLowerCase() === "mit") hasFridayMit = true;
  }

  if (!hasFridayMit) problems.unshift({ line: 1, reason: "friday-missing" });
  return { ok: problems.length === 0, problems };
}
