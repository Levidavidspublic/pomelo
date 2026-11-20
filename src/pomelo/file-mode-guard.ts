export interface FileModeFinding {
  path: string;
  kind: "symlink" | "submodule" | "executable" | "unreadable";
  reason: string;
}

const rawHeader = /^:([0-7]{6}) ([0-7]{6}) [0-9a-f]{1,64} [0-9a-f]{1,64} ([ADBTUX]|M[0-9]{0,3}|[RC][0-9]{1,3})$/;
const unquotedPath = /^[^"\\\x00-\x1f\x7f]+$/;
const quotedPath = /^"(?:[^"\\\x00-\x1f\x7f]|\\(?:[abtnvfr"\\]|[0-3][0-7]{2}))+"$/;
const gitPathEscapes: Record<string, string> = {
  a: "\x07",
  b: "\b",
  t: "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\",
};

function decodeGitPath(field: string): string | undefined {
  if (unquotedPath.test(field)) return field;
  if (!quotedPath.test(field)) return;

  // Git quotes non-ASCII bytes as octal escapes by default.
  const bytes: Buffer[] = [];
  for (const [, literal, octal, escape] of field.slice(1, -1).matchAll(/([^\\]+)|\\([0-3][0-7]{2})|\\(.)/g)) {
    bytes.push(octal ? Buffer.from([Number.parseInt(octal, 8)]) : Buffer.from(literal ?? gitPathEscapes[escape]));
  }
  try {
    const path = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(bytes));
    if (!path.includes("\0")) return path;
  } catch {
    // An invalid UTF-8 path cannot be represented faithfully as text.
  }
}

/** Check the line-oriented output of git diff --raw. */
export function checkFileModes(raw: string): { ok: boolean; findings: FileModeFinding[] } {
  const findings: FileModeFinding[] = [];
  const lines = raw.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();

  for (const [index, line] of lines.entries()) {
    const [header, ...fields] = line.split("\t");
    const match = rawHeader.exec(header);
    const paths = fields.map(decodeGitPath);
    const path = paths.at(-1);
    const status = match?.[3] ?? "";
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    if (!match || !path || paths.includes(undefined) || fields.length !== pathCount || Number(status.slice(1)) > 100) {
      findings.push({ path: "", kind: "unreadable", reason: "Could not read raw diff line " + (index + 1) + "." });
      continue;
    }

    const [, oldMode, newMode] = match;
    if (newMode === "120000") {
      findings.push({ path, kind: "symlink", reason: "The new entry is a symbolic link." });
    } else if (newMode === "160000") {
      findings.push({ path, kind: "submodule", reason: "The new entry points to a submodule commit." });
    } else if (newMode === "100755" && (status === "A" || status.startsWith("C") || oldMode === "100644")) {
      findings.push({ path, kind: "executable", reason: "The path is newly executable." });
    }
  }

  return { ok: findings.length === 0, findings };
}
