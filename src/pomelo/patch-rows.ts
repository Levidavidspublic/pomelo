type PatchRow = {
  line: number;
  file: string;
  reason: string;
  ticket: string;
};

type PatchRowFinding = { line: number; problem: string };
type PatchColumns = { file: number; reason: number; ticket: number };

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

function patchColumns(header: string[], divider: string[] | undefined): PatchColumns | undefined {
  if (divider?.length !== header.length || !divider.every((cell) => /^:?-+:?$/.test(cell))) return undefined;

  const labels = header.map((cell) => cell.toLowerCase());
  const file = labels.findIndex((cell) => cell === "file" || cell === "file path");
  const reason = labels.findIndex((cell) => cell === "reason" || cell === "why");
  const ticket = labels.indexOf("ticket");
  if (file < 0 || reason < 0 || ticket < 0) return undefined;
  return { file, reason, ticket };
}

function isFridayFile(file: string): boolean {
  if (/^[a-z][a-z\d+.-]*:|[\p{Cc}`<>|*?]|^\[.*\]\(/iu.test(file)) return false;
  if (file.split("/").some((part) => part === "" || part === "." || part === "..")) return false;
  return !/^src\/(?:client\/)?pomelo(?:\/|$)/.test(file);
}

export function checkPatchRows(markdownText: string): {
  ok: boolean;
  rows: PatchRow[];
  findings: PatchRowFinding[];
} {
  const lines = markdownText.split(/\r?\n/);
  const rows: PatchRow[] = [];
  const findings: PatchRowFinding[] = [];
  const firstLines = new Map<string, number>();
  let columns: PatchColumns | undefined;
  let fence: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fenceMatch) {
      const [, marker, rest] = fenceMatch;
      if (!fence) fence = marker;
      else if (marker.startsWith(fence) && rest.trim() === "") fence = undefined;
      columns = undefined;
      continue;
    }
    if (fence) continue;

    const cells = tableCells(text);
    if (!cells) {
      columns = undefined;
      continue;
    }

    if (!columns) {
      columns = patchColumns(cells, tableCells(lines[index + 1] ?? ""));
      if (columns) index += 1;
      continue;
    }

    const line = index + 1;
    const row = {
      line,
      file: (cells[columns.file] ?? "").replace(/^`([^`]*)`$/, "$1").trim().replaceAll("\\", "/"),
      reason: cells[columns.reason] ?? "",
      ticket: cells[columns.ticket] ?? "",
    };
    rows.push(row);

    if (!row.file) {
      findings.push({ line, problem: "Missing file path." });
    } else {
      if (!isFridayFile(row.file)) {
        findings.push({ line, problem: "Expected a plain repo-relative Friday file path." });
      }
      const firstLine = firstLines.get(row.file);
      if (firstLine === undefined) {
        firstLines.set(row.file, line);
      } else {
        findings.push({ line, problem: `Duplicate file ${row.file} (first listed on line ${firstLine}).` });
      }
    }

    if (!row.reason) findings.push({ line, problem: "Missing reason." });
    if (!/(?:^|[^\w])(?:#\d+|P\d+-\d+)\b/.test(row.ticket)) {
      findings.push({ line, problem: "Missing ticket reference." });
    }
  }

  return { ok: findings.length === 0, rows, findings };
}
