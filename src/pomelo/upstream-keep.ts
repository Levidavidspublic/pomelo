import { Buffer } from "node:buffer";

export type UpstreamKeepFinding =
  | { path: string; kind: "deleted" | "renamed" | "moved"; reason: string }
  | { path: null; kind: "unreadable"; reason: string };

// Copies and renames carry similarity scores. A rewritten file can carry a dissimilarity score.
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
  if (!field.startsWith('"')) return field && !field.includes("\0") ? field : undefined;
  if (!QUOTED_PATH.test(field)) return undefined;

  const path = field.slice(1, -1).replace(GIT_PATH_ESCAPE, (escape, character: string | undefined) => {
    if (character !== undefined) return ESCAPED_CHARACTERS[character];

    // Git quotes UTF-8 bytes in octal, so decode consecutive bytes together.
    const bytes = escape.slice(1).split("\\").map((octal) => Number.parseInt(octal, 8));
    return Buffer.from(bytes).toString("utf8");
  });

  return path.includes("\0") ? undefined : path;
}

/** Checks line-delimited Git name-status output against decoded, repository-relative Friday paths. */
export function findRemovedUpstreamFiles(
  nameStatusText: string,
  fridayPaths: readonly string[],
): UpstreamKeepFinding[] {
  const friday = new Set(fridayPaths);
  const findings: UpstreamKeepFinding[] = [];

  for (const [index, line] of nameStatusText.split(/\r?\n/).entries()) {
    if (line === "") continue;

    const fields = line.split("\t");
    const [status, sourceField = "", destinationField = ""] = fields;
    const hasDestination = status[0] === "R" || status[0] === "C";
    const path = readPath(sourceField);
    const destination = readPath(destinationField);
    if (!NAME_STATUS.test(status) || fields.length !== (hasDestination ? 3 : 2)
      || !path || (hasDestination && !destination)) {
      findings.push({ path: null, kind: "unreadable", reason: `The check could not read this line (line ${index + 1}).` });
      continue;
    }

    // The import branch contains POMELO.md from a Pomelo merge.
    if (!friday.has(path) || path === "POMELO.md" || path.startsWith("test/")
      || path.startsWith("src/pomelo/") || path.startsWith("src/client/pomelo/")) continue;

    if (status === "D") {
      findings.push({ path, kind: "deleted", reason: `${JSON.stringify(path)} was deleted.` });
    } else if (status[0] === "R" && destination && path !== destination) {
      const directory = path.slice(0, path.lastIndexOf("/") + 1);
      const destinationDirectory = destination.slice(0, destination.lastIndexOf("/") + 1);
      const kind = directory === destinationDirectory ? "renamed" : "moved";
      findings.push({ path, kind, reason: `${JSON.stringify(path)} was ${kind} to ${JSON.stringify(destination)}.` });
    }
  }

  return findings;
}
