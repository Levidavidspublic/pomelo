import { hideSecrets, HIDDEN } from "../secrets.js";

export interface SecretLine {
  readonly path: string;
  readonly line: number;
  readonly kind: "secret" | "private-key";
}

const LINE_BREAK = /\r\n|[\r\n]/;
// Match Friday's private-key boundaries so a whole-block redaction keeps its original line number.
const PEM_BLOCK = /(-----BEGIN ([A-Z ]*)PRIVATE KEY-----)[\s\S]*?(?:-----END \2PRIVATE KEY-----|$)/g;

/** Report one hit per affected line, with line numbers starting at one. */
export function secretLines(files: readonly Readonly<{ path: string; text: string }>[]): SecretLine[] {
  const hits: SecretLine[] = [];
  for (const { path, text } of files) {
    const hasWholeTextHit = hideSecrets(text).hidden > 0;
    const privateKeyLines = new Set<number>();
    let line = 1;
    let offset = 0;
    const remaining = text.replace(PEM_BLOCK, (block: string, header: string, _label: string, start: number) => {
      line += text.slice(offset, start).split(LINE_BREAK).length - 1;
      const firstLine = line;
      line += block.split(LINE_BREAK).length - 1;
      offset = start + block.length;

      // Remove only the header for an already hidden block so its other text can still be checked.
      if (!hasWholeTextHit || block.includes(HIDDEN)) return ` ${block.slice(header.length)}`;

      privateKeyLines.add(firstLine);
      return block.replace(/[^\r\n]+/g, " ");
    });

    for (const [index, content] of remaining.split(LINE_BREAK).entries()) {
      const line = index + 1;
      const kind = privateKeyLines.has(line) ? "private-key" : "secret";
      if (kind === "private-key" || hideSecrets(content).hidden > 0) hits.push(Object.freeze({ path, line, kind }));
    }
  }
  return hits;
}
