export type WorktreeVerdict = "clean" | "dirty" | "unreadable";
export type WorktreeLeftoverKind = "untracked" | "modified" | "staged" | "deleted" | "renamed" | "conflict";

export interface WorktreeLeftover {
  path: string;
  kind: WorktreeLeftoverKind;
}

export interface WorktreeCheckOptions {
  /** Repository-relative paths. An entry covers itself and its descendants. */
  allow?: readonly string[];
}

export interface WorktreeCheckResult {
  ok: boolean;
  verdict: WorktreeVerdict;
  leftovers: WorktreeLeftover[];
  reason: string;
}

const conflicts = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const trackedStatus = /^(?: [AMTDRC]|[MATRC][ MTD]|D[ RC])$/;
const quotedPath = /^"(?:[^"\\\x00-\x1f\x7f]|\\(?:[abtnvfr"\\]|[0-3][0-7]{2}))+"$/;
const pathPair = /^("(?:[^"\\]|\\.)*"|[^"]*?) -> (.+)$/s;
const quotedEscapes: Record<string, string> = {
  a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", '"': '"', "\\": "\\",
};
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function readPath(raw: string): string | null {
  let path = raw;
  if (raw.startsWith('"')) {
    if (!quotedPath.test(raw)) return null;
    try {
      path = raw.slice(1, -1).replace(/(?:\\[0-3][0-7]{2})+|\\./g, (escape) => {
        if (escape.length === 2) return quotedEscapes[escape[1]];
        const octets = escape.slice(1).split("\\");
        return utf8.decode(Uint8Array.from(octets, (octet) => parseInt(octet, 8)));
      });
    } catch {
      return null;
    }
  } else if (/["\\\x00-\x1f\x7f]/.test(raw)) {
    return null;
  }

  const components = path.replace(/\/$/, "").split("/");
  if (path.includes("\0") || components.some((part) => part === "" || part === "." || part === "..")) return null;
  return path;
}

function readStatusLine(line: string): WorktreeLeftover[] | null {
  if (line[2] !== " ") return null;
  const status = line.slice(0, 2);
  const rawPath = line.slice(3);
  let kind: WorktreeLeftoverKind;
  if (status === "??") kind = "untracked";
  else if (conflicts.has(status)) kind = "conflict";
  else if (!trackedStatus.test(status)) return null;
  else if (status.includes("R")) kind = "renamed";
  else if (status.includes("D")) kind = "deleted";
  else kind = status[1] === " " ? "staged" : "modified";

  if (kind === "renamed" || status.includes("C")) {
    const pair = pathPair.exec(rawPath);
    if (!pair) return null;
    const [, from, to] = pair;
    // Git quotes paths that contain the same arrow text as the separator.
    if ([from, to].some((path) => !path.startsWith('"') && path.includes(" -> "))) return null;
    const source = readPath(from);
    const destination = readPath(to);
    if (source === null || destination === null) return null;
    if (kind === "renamed") return [{ path: source, kind }, { path: destination, kind }];
    return [{ path: destination, kind }];
  }

  const path = readPath(rawPath);
  return path === null ? null : [{ path, kind }];
}

/** Check the line-oriented output of Git status porcelain v1. */
export function checkWorktree(statusText: string, opts: WorktreeCheckOptions = {}): WorktreeCheckResult {
  const allowed = (opts.allow ?? []).map((path) => path.replace(/^\.\//, "").replace(/\/+$/, "")).filter(Boolean);
  const leftovers: WorktreeLeftover[] = [];
  const lines = statusText.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();

  let unreadableLine: number | undefined;
  for (const [i, line] of lines.entries()) {
    const entries = readStatusLine(line);
    if (entries === null) {
      unreadableLine ??= i + 1;
      continue;
    }
    for (const entry of entries) {
      if (!allowed.some((path) => entry.path === path || entry.path.startsWith(path + "/"))) leftovers.push(entry);
    }
  }

  if (unreadableLine !== undefined) {
    return { ok: false, verdict: "unreadable", leftovers, reason: "Could not read Git status line " + unreadableLine + "." };
  }
  if (leftovers.length > 0) {
    return { ok: false, verdict: "dirty", leftovers, reason: "The worktree has leftover paths." };
  }
  return { ok: true, verdict: "clean", leftovers, reason: "The worktree is clean." };
}
