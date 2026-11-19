import { Buffer, isUtf8 } from "node:buffer";
import * as fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export interface CanaryStorageOptions {
  maxBytes?: number;
  /** Called for each line. Return form labels only. */
  find?: (text: string, canary: string) => readonly string[];
}

type SkipReason = "binary" | "missing" | "not-directory" | "not-file" | "symlink" | "too-large" | "unreadable";

export interface CanaryStorageResult {
  filesScanned: number;
  skipped: { file: string; reason: SkipReason }[];
  /** Line numbers are one-based. A path containing a canary form is shown as `…`. */
  hits: { file: string; line: number; form: string }[];
}

function canaryNeedles(canary: string): Map<string, string> {
  const needles = new Map<string, string>();
  if (canary === "") return needles;

  const bytes = Buffer.from(canary, "utf8");
  const hex = bytes.toString("hex");
  const forms = [
    [canary, "plain"],
    [JSON.stringify(canary).slice(1, -1), "json"],
    [encodeURIComponent(bytes.toString("utf8")), "url"],
    [bytes.toString("base64"), "base64"],
    [hex, "hex"],
    [hex.toUpperCase(), "hex"],
  ];
  // Some canaries are unchanged by JSON escaping or URL encoding.
  for (const [needle, form] of forms) {
    if (!needles.has(needle)) needles.set(needle, form);
  }
  return needles;
}

function fileError(error: unknown): SkipReason {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return "missing";
  if (code === "ELOOP") return "symlink";
  return "unreadable";
}

function readText(file: string, maxBytes: number): { text: string } | { reason: SkipReason } {
  try {
    // Check the open file too, since a Friday write may have replaced it since lstat.
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) return { reason: "not-file" };
      if (stat.size > maxBytes) return { reason: "too-large" };

      const chunks: Buffer[] = [];
      let length = 0;
      while (true) {
        // One extra byte distinguishes a file at the limit from one that grew past it.
        const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - length + 1));
        const count = fs.readSync(fd, chunk, 0, chunk.length, null);
        if (count === 0) break;
        length += count;
        if (length > maxBytes) return { reason: "too-large" };
        chunks.push(chunk.subarray(0, count));
      }

      const bytes = Buffer.concat(chunks, length);
      if (bytes.includes(0) || !isUtf8(bytes)) return { reason: "binary" };
      return { text: bytes.toString("utf8") };
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    return { reason: fileError(error) };
  }
}

export function scanHomeForCanary(homeDir: string, canary: string, opts: CanaryStorageOptions = {}): CanaryStorageResult {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a nonnegative safe integer");
  }

  const home = path.resolve(homeDir);
  const result: CanaryStorageResult = { filesScanned: 0, skipped: [], hits: [] };
  const needles = canaryNeedles(canary);
  const safeLabel = (label: string) => {
    for (const needle of needles.keys()) {
      if (label.includes(needle)) return "…";
    }
    return label;
  };
  const find = opts.find ?? ((text: string) => {
    const forms: string[] = [];
    for (const [needle, form] of needles) {
      if (text.includes(needle)) forms.push(form);
    }
    return forms;
  });

  function walk(entry: string): void {
    const file = safeLabel(path.relative(home, entry) || ".");
    const skip = (reason: SkipReason) => result.skipped.push({ file, reason });

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(entry);
    } catch (error) {
      skip(fileError(error));
      return;
    }

    if (stat.isSymbolicLink()) {
      skip("symlink");
    } else if (stat.isDirectory()) {
      let children: string[];
      try {
        children = fs.readdirSync(entry).sort();
      } catch (error) {
        skip(fileError(error));
        return;
      }
      for (const child of children) walk(path.join(entry, child));
    } else if (entry === home) {
      skip("not-directory");
    } else if (!stat.isFile()) {
      skip("not-file");
    } else if (stat.size > maxBytes) {
      skip("too-large");
    } else {
      const contents = readText(entry, maxBytes);
      if ("reason" in contents) {
        skip(contents.reason);
        return;
      }
      result.filesScanned++;
      const lines = contents.text.split(/\r\n|\n|\r/);
      if (lines.at(-1) === "") lines.pop();
      for (const [index, line] of lines.entries()) {
        try {
          const forms = new Set(find(line, canary).map(safeLabel));
          for (const form of forms) result.hits.push({ file, line: index + 1, form });
        } catch {
          throw new Error("Canary storage matcher failed");
        }
      }
    }
  }

  walk(home);
  return result;
}
