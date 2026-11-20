export type PathNameFinding = {
  path: string;
  kind: "case-clash" | "reserved-name" | "bad-character" | "trailing-dot-or-space" | "too-long";
  reason: string;
};

const RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const BAD_CHARACTER = /[<>:"|?*\\\p{Cc}]/u;
const MAX_PATH_LENGTH = 240;

function compare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function checkPathNames(added: string[], existing: string[]): { ok: boolean; findings: PathNameFinding[] } {
  const findings: PathNameFinding[] = [];
  if (added.length === 0) return { ok: true, findings };

  const pathsByKey = new Map<string, { path: string; normalized: string }[]>();
  // Sort conflicting spellings so the path named in a reason is independent of input order.
  for (const path of [...new Set([...added, ...existing])].sort()) {
    const normalized = path.normalize("NFC");
    const key = normalized.toLowerCase();
    const paths = pathsByKey.get(key);
    if (paths) {
      paths.push({ path, normalized });
    } else {
      pathsByKey.set(key, [{ path, normalized }]);
    }
  }

  for (const path of new Set(added)) {
    const normalized = path.normalize("NFC");
    const matches = pathsByKey.get(normalized.toLowerCase()) ?? [];
    // Prefer a normalization-only conflict when the key has several spellings.
    const match = matches.find((other) => other.path !== path && other.normalized === normalized)
      ?? matches.find((other) => other.path !== path);
    if (match) {
      let comparison = "letter case and Unicode normalization";
      if (match.normalized === normalized) {
        comparison = "Unicode normalization";
      } else if (path.toLowerCase() === match.path.toLowerCase()) {
        comparison = "letter case";
      }
      findings.push({
        path,
        kind: "case-clash",
        reason: `Matches ${JSON.stringify(match.path)} when ignoring ${comparison}.`,
      });
    }

    const parts = path.split("/");
    const reserved = parts.find((part) => RESERVED_NAME.test(part));
    const badCharacter = parts.find((part) => BAD_CHARACTER.test(part));
    const trailing = parts.find((part) => part.endsWith(".") || part.endsWith(" "));
    if (reserved !== undefined) {
      findings.push({
        path,
        kind: "reserved-name",
        reason: `${JSON.stringify(reserved)} uses a reserved Windows device name.`,
      });
    }
    if (badCharacter !== undefined) {
      findings.push({
        path,
        kind: "bad-character",
        reason: `${JSON.stringify(badCharacter)} contains a forbidden character.`,
      });
    }
    if (trailing !== undefined) {
      findings.push({
        path,
        kind: "trailing-dot-or-space",
        reason: `${JSON.stringify(trailing)} ends with a dot or space.`,
      });
    }
    if (path.length > MAX_PATH_LENGTH) {
      findings.push({
        path,
        kind: "too-long",
        reason: `The path exceeds ${MAX_PATH_LENGTH} characters.`,
      });
    }
  }

  findings.sort((left, right) => compare(left.path, right.path) || compare(left.kind, right.kind));
  return { ok: findings.length === 0, findings };
}
