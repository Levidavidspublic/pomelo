export interface DiffSizeLimits {
  sourceFile: number;
  testFile: number;
  totalAdded: number;
}

export interface DiffSizeResult {
  ok: boolean;
  totalAdded: number;
  totalRemoved: number;
  overLimit: { path: string; added: number | "binary"; limit: number }[];
  reasons: string[];
}

const renameMarker = " => ";
const pathEscapes: Record<string, string> = {
  a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", '"': '"', "\\": "\\",
};

function unquotePath(path: string): string {
  if (!path.startsWith('"')) return path;
  if (!path.endsWith('"')) return "";

  const bytes: Buffer[] = [];
  const quoted = path.slice(1, -1);
  // Git's octal escapes encode bytes, including individual bytes of UTF-8 characters.
  for (const [chunk] of quoted.matchAll(/[^\\"]+|\\[0-3][0-7][0-7]|\\[abtnvfr"\\]|[\\"]/g)) {
    if (chunk === '"' || chunk === "\\") return "";
    if (chunk.startsWith("\\") && chunk.length === 4) {
      bytes.push(Buffer.from([Number.parseInt(chunk.slice(1), 8)]));
    } else {
      bytes.push(Buffer.from(chunk.startsWith("\\") ? pathEscapes[chunk[1]] : chunk));
    }
  }
  return Buffer.concat(bytes).toString("utf8");
}

function expandCompactRename(path: string, marker: number): string | undefined {
  if (marker === -1) return undefined;
  const open = path.lastIndexOf("{", marker);
  const close = path.indexOf("}", marker + renameMarker.length);
  if (open === -1 || close === -1) return undefined;
  if (open > 0 && path[open - 1] !== "/") return undefined;
  if (close + 1 < path.length && path[close + 1] !== "/") return undefined;

  const destination = path.slice(marker + renameMarker.length, close);
  const suffix = path.slice(close + 1);
  return path.slice(0, open) + destination + (destination ? suffix : suffix.replace(/^\//, ""));
}

function destinationPath(rawPath: string): string {
  if (rawPath.startsWith('"')) {
    // A full rename can quote its old and new paths separately.
    for (let index = 1; index < rawPath.length; index++) {
      if (rawPath[index] === "\\") {
        index++;
      } else if (rawPath[index] === '"') {
        if (rawPath.startsWith(renameMarker, index + 1)) {
          return unquotePath(rawPath.slice(index + 1 + renameMarker.length));
        }
        const path = unquotePath(rawPath);
        return expandCompactRename(path, path.indexOf(renameMarker)) ?? path;
      }
    }
    return "";
  }

  const marker = rawPath.indexOf(renameMarker);
  if (marker === -1) return rawPath;
  return expandCompactRename(rawPath, marker) ?? unquotePath(rawPath.slice(marker + renameMarker.length));
}

function lineCount(text: string): number {
  return text !== "" && !/[^0-9]/.test(text) ? Number(text) : NaN;
}

export function checkDiffSize(numstatText: string, limits: Partial<DiffSizeLimits> = {}): DiffSizeResult {
  const { sourceFile = 400, testFile = 600, totalAdded: totalLimit = 1200 } = limits;
  const overLimit: DiffSizeResult["overLimit"] = [];
  const reasons: string[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  if ([sourceFile, testFile, totalLimit].some((limit) => !Number.isSafeInteger(limit) || limit < 0)) {
    reasons.push("Diff size limits must be nonnegative whole numbers.");
    return { ok: false, totalAdded, totalRemoved, overLimit, reasons };
  }
  if (typeof numstatText !== "string" || !numstatText.trim()) {
    reasons.push("Expected nonempty git diff --numstat text.");
    return { ok: false, totalAdded, totalRemoved, overLimit, reasons };
  }

  const lines = numstatText.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  for (const [index, line] of lines.entries()) {
    const fields = line.split("\t");
    const [addedText, removedText, rawPath] = fields;
    const path = fields.length === 3 ? destinationPath(rawPath) : "";
    if (!path || path.includes("\0")) {
      reasons.push(`Could not read numstat line ${index + 1}.`);
      continue;
    }

    const isTest = path.startsWith("test/") && path.endsWith(".test.ts");
    const isSource = path.startsWith("src/pomelo/") || path.startsWith("src/client/pomelo/");
    const limit = isTest ? testFile : isSource ? sourceFile : undefined;
    if (addedText === "-" && removedText === "-") {
      overLimit.push({ path, added: "binary", limit: limit ?? totalLimit });
      reasons.push(`${JSON.stringify(path)} is binary, so its added lines cannot be counted.`);
      continue;
    }

    const added = lineCount(addedText);
    const removed = lineCount(removedText);
    if (!Number.isSafeInteger(totalAdded + added) || !Number.isSafeInteger(totalRemoved + removed)) {
      reasons.push(`Could not read line counts on numstat line ${index + 1}.`);
      continue;
    }

    totalAdded += added;
    totalRemoved += removed;
    if (limit !== undefined && added > limit) {
      overLimit.push({ path, added, limit });
      reasons.push(`${JSON.stringify(path)} adds ${added} lines and exceeds its limit of ${limit}.`);
    }
  }

  if (totalAdded > totalLimit) {
    reasons.push(`The PR adds ${totalAdded} lines and exceeds its limit of ${totalLimit}.`);
  }
  overLimit.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: reasons.length === 0, totalAdded, totalRemoved, overLimit, reasons };
}
