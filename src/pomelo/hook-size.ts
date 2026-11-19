import { isPomeloPath } from "./patch-ledger.js";

interface OversizedHook {
  path: string;
  added: number | null;
  limit: number;
}

const gitPathEscapes: Record<string, string> = {
  a: "\x07",
  b: "\b",
  t: "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
};

function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path;

  // Git quotes non-ASCII bytes as octal escapes by default.
  const bytes: Buffer[] = [];
  for (const [, literal, octal, escape] of path.slice(1, -1).matchAll(/([^\\]+)|\\([0-3][0-7]{2})|\\(.)/g)) {
    bytes.push(octal
      ? Buffer.from([Number.parseInt(octal, 8)])
      : Buffer.from(literal ?? gitPathEscapes[escape] ?? escape));
  }
  return Buffer.concat(bytes).toString("utf8");
}

function destinationPath(path: string): string {
  const compactRename = path.replace(/^([^"]*?)\{[^"]*? => ([^"]*)\}(\/[^"]*)?$/, "$1$2$3");
  if (compactRename !== path) return compactRename.replace(/\/{2,}/g, "/");

  const rename = path.match(/^(?:"(?:[^"\\]|\\.)*"|[^"]+) => (.*)$/);
  return unquotePath(rename?.[1] ?? path);
}

export function checkHookSize(numstatText: string, limit = 20): { ok: boolean; tooBig: OversizedHook[] } {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("Hook size limit must be a positive integer");
  }

  const tooBig: OversizedHook[] = [];

  for (const line of numstatText.split(/\r?\n/)) {
    const fields = line.split("\t");
    if (fields.length !== 3) continue;

    const [addedText, deletedText, rawPath] = fields;
    const binary = addedText === "-" && deletedText === "-";
    if (!binary && (!/^\d+$/.test(addedText) || !/^\d+$/.test(deletedText))) continue;

    const added = binary ? null : Number(addedText);
    if (added !== null && (!Number.isSafeInteger(added) || added <= limit)) continue;

    const path = destinationPath(rawPath);
    if (!path || isPomeloPath(path) || path === "package-lock.json") continue;

    tooBig.push({ path, added, limit });
  }

  tooBig.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: tooBig.length === 0, tooBig };
}
