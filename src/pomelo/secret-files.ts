import { Buffer } from "node:buffer";

const SECRET_NAMES = Object.freeze([
  { pattern: /^\.env(?:\.(?!(?:example|sample|template)$)[\s\S]*)?$/i, kind: "env", reason: "Environment files can hold secrets." },
  { pattern: /\.(?:pem|key|p12|pfx|jks)$/i, kind: "key-file", reason: "Key and certificate files can hold private keys." },
  { pattern: /\.kdbx$/i, kind: "password-database", reason: "KeePass databases can hold passwords." },
  { pattern: /\.1pux$/i, kind: "1password-export", reason: "1Password exports can hold vault contents." },
  { pattern: /^id_(?:rsa|ed25519|ecdsa)$/i, kind: "ssh-key", reason: "This is an SSH private key filename." },
  { pattern: /^(?:\.npmrc|\.netrc|\.git-credentials|credentials\.json)$/i, kind: "credential-file", reason: "Credential files can hold login details." },
  { pattern: /^(?:Cookies|Login Data|Web Data)(?:-journal)?$/i, kind: "browser-profile", reason: "Chromium profile files can hold login or session data." },
] as const);

export type SecretFileFinding =
  | { path: string; kind: (typeof SECRET_NAMES)[number]["kind"]; reason: string }
  | { path: null; kind: "unreadable"; reason: string };

export interface SecretFilesResult {
  ok: boolean;
  findings: SecretFileFinding[];
}

// Copies and renames carry similarity scores. A rewrite can carry a dissimilarity score.
const NAME_STATUS = /^(?:[ADMTUXB]|[CRM](?:100|0?\d{1,2}))$/;
const QUOTED_PATH = /^"(?:[^"\\]|\\(?:[abfnrtv"\\]|[0-3][0-7]{2}))+"$/;
const GIT_PATH_ESCAPE = /(?:\\[0-3][0-7]{2})+|\\([abfnrtv"\\])/g;
const ESCAPED_CHARACTERS: Readonly<Record<string, string>> = {
  a: "\x07",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  '"': '"',
  "\\": "\\",
};

function readPath(field: string): string | undefined {
  if (!field || /[\x00-\x1f\x7f]/.test(field)) return undefined;

  let path = field;
  if (field.startsWith('"')) {
    if (!QUOTED_PATH.test(field)) return undefined;

    path = field.slice(1, -1).replace(GIT_PATH_ESCAPE, (escape, character: string | undefined) => {
      if (character !== undefined) return ESCAPED_CHARACTERS[character];

      // Git quotes UTF-8 bytes in octal, so decode consecutive bytes together.
      const bytes = escape.slice(1).split("\\").map((octal) => Number.parseInt(octal, 8));
      return Buffer.from(bytes).toString("utf8");
    });
  } else if (/["\\]/.test(field)) {
    return undefined;
  }

  if (path.includes("\0") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return undefined;
  }
  return path;
}

/** Checks added, copied and renamed-to paths from line-delimited Git name-status output. */
export function secretFiles(nameStatusText: unknown): SecretFilesResult {
  if (typeof nameStatusText !== "string" || !nameStatusText.trim()) {
    return {
      ok: false,
      findings: [{ path: null, kind: "unreadable", reason: "The check needs Git name-status text." }],
    };
  }

  const findings: SecretFileFinding[] = [];
  for (const [index, line] of nameStatusText.split(/\r?\n/).entries()) {
    if (line === "") continue;

    const fields = line.split("\t");
    const [status, sourceField = "", destinationField = ""] = fields;
    const hasDestination = status[0] === "R" || status[0] === "C";
    const source = readPath(sourceField);
    const path = hasDestination ? readPath(destinationField) : source;
    if (!NAME_STATUS.test(status) || fields.length !== (hasDestination ? 3 : 2) || !source || !path) {
      findings.push({ path: null, kind: "unreadable", reason: `The check could not read this line (line ${index + 1}).` });
      continue;
    }

    if (status !== "A" && !hasDestination) continue;
    const name = path.slice(path.lastIndexOf("/") + 1);
    const match = SECRET_NAMES.find(({ pattern }) => pattern.test(name));
    if (match) findings.push({ path, kind: match.kind, reason: match.reason });
  }

  return { ok: findings.length === 0, findings };
}
