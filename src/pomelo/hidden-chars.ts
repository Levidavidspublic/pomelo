export const HIDDEN_CODE_POINTS: Readonly<Partial<Record<number, string>>> = Object.freeze({
  0x200b: "U+200B",
  0x200c: "U+200C",
  0x200d: "U+200D",
  0x200e: "U+200E",
  0x200f: "U+200F",
  0x202a: "U+202A",
  0x202b: "U+202B",
  0x202c: "U+202C",
  0x202d: "U+202D",
  0x202e: "U+202E",
  0x2060: "U+2060",
  0x2066: "U+2066",
  0x2067: "U+2067",
  0x2068: "U+2068",
  0x2069: "U+2069",
  0xfeff: "U+FEFF",
});

export type HiddenCharFinding = {
  path: string;
  line: number;
  /** One-based Unicode code-point offset. */
  column: number;
  codePoint: string;
};

const codeFile = /\.(?:ts|tsx|mjs|cjs|json)$/i;
const formatCharacter = /\p{Cf}/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Inspect added lines and return the location and code point of each match. */
export function findHiddenChars(files: unknown): HiddenCharFinding[] {
  try {
    if (!Array.isArray(files)) return [];

    const findings: HiddenCharFinding[] = [];
    for (const file of files as readonly unknown[]) {
      if (!isRecord(file)) return [];
      const { path, addedLines } = file;
      if (typeof path !== "string" || !path || !Array.isArray(addedLines)) return [];
      const flagDirectionMarks = codeFile.test(path);

      for (const addedLine of addedLines as readonly unknown[]) {
        if (!isRecord(addedLine)) return [];
        const { line, text } = addedLine;
        if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1 || typeof text !== "string") return [];

        let column = 0;
        for (const character of text) {
          column += 1;
          const point = character.codePointAt(0)!;
          if (point === 0xfeff && line === 1 && column === 1) continue;
          if ((point === 0x200e || point === 0x200f) && !flagDirectionMarks) continue;

          const name = HIDDEN_CODE_POINTS[point];
          if (!name && !formatCharacter.test(character)) continue;
          const codePoint = name ?? `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
          findings.push({ path, line, column, codePoint });
        }
      }
    }
    return findings;
  } catch {
    // Accessors or proxies in malformed input can throw during validation.
    return [];
  }
}
