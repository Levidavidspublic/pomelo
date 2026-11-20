export interface LineEndingChange {
  readonly path: string;
  readonly status?: "added" | "modified" | "deleted";
  readonly bytes?: Uint8Array | null;
}

const messages = {
  crlf: "This file uses Windows (CRLF) line endings.",
  mixed: "This file mixes Windows (CRLF) and LF line endings.",
  bom: "This file starts with a UTF-8 byte-order mark.",
  "not-utf8": "This file contains invalid UTF-8.",
};

type Reason = keyof typeof messages;

export interface LineEndingProblem {
  path: string;
  reason: Reason;
  line: number;
  message: string;
}

const binaryExtensions = new Set([
  ".avif", ".bmp", ".gif", ".icns", ".ico", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp",
  ".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav", ".avi", ".mkv", ".mov", ".mp4", ".webm",
  ".7z", ".bz2", ".gz", ".rar", ".tar", ".tgz", ".xz", ".zip",
  ".docx", ".pdf", ".pptx", ".xlsx", ".otf", ".ttf", ".woff", ".woff2",
  ".bin", ".db", ".dll", ".dmg", ".exe", ".node", ".so", ".sqlite", ".sqlite3", ".wasm",
]);

const LF = 0x0a;
const CR = 0x0d;

function isUtf8(decoder: TextDecoder, bytes: Uint8Array): boolean {
  try {
    decoder.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function firstInvalidUtf8Line(decoder: TextDecoder, bytes: Uint8Array): number | undefined {
  if (isUtf8(decoder, bytes)) return;

  // An LF byte cannot be part of a multibyte sequence, so each line can be checked independently.
  let line = 1;
  let start = 0;
  while (start < bytes.length) {
    const newline = bytes.indexOf(LF, start);
    const end = newline === -1 ? bytes.length : newline + 1;
    if (!isUtf8(decoder, bytes.subarray(start, end))) return line;
    start = end;
    line++;
  }
}

/** Check new file contents and report the first affected line for each reason. */
export function lineEndingCheck(changes: readonly LineEndingChange[]): { ok: boolean; problems: LineEndingProblem[] } {
  const problems: LineEndingProblem[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const { path, status, bytes } of changes) {
    if (status === "deleted" || !bytes) continue;
    const extension = /\.[^./\\]+$/.exec(path)?.[0].toLowerCase();
    if ((extension && binaryExtensions.has(extension)) || bytes.includes(0)) continue;

    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      problems.push({ path, reason: "bom", line: 1, message: messages.bom });
    }

    let firstCrlfLine: number | undefined;
    let hasLf = false;
    let line = 1;
    for (let newline = bytes.indexOf(LF); newline !== -1; newline = bytes.indexOf(LF, newline + 1)) {
      if (bytes[newline - 1] === CR) {
        firstCrlfLine ??= line;
      } else {
        hasLf = true;
      }
      if (firstCrlfLine !== undefined && hasLf) break;
      line++;
    }
    if (firstCrlfLine !== undefined) {
      const reason = hasLf ? "mixed" : "crlf";
      problems.push({ path, reason, line: firstCrlfLine, message: messages[reason] });
    }

    const invalidLine = firstInvalidUtf8Line(decoder, bytes);
    if (invalidLine !== undefined) {
      problems.push({ path, reason: "not-utf8", line: invalidLine, message: messages["not-utf8"] });
    }
  }

  problems.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
  return { ok: problems.length === 0, problems };
}
