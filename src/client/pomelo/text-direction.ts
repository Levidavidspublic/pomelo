type Direction = "rtl" | "ltr" | "auto";

const INDENTED_CODE = /^(?: {4}| {0,3}\t)/;
const FENCE_END = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
// Match whole code spans and URLs before considering individual letters.
const DIRECTION_TOKEN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)|\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>()`]+(?:\([^\s<>()`]*\)[^\s<>()`]*)*|(\p{Letter})/giu;

function openingFence(line: string): string | undefined {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  const fence = match?.[1];
  if (fence?.startsWith("`") && match?.[2]?.includes("`")) return undefined;
  return fence;
}

function proseDirection(text: string): Direction {
  for (const [, , letter] of text.matchAll(DIRECTION_TOKEN)) {
    if (!letter) continue;
    if (/[\p{Script=Hebrew}\p{Script=Arabic}]/u.test(letter)) return "rtl";
    if (/\p{Script=Latin}/u.test(letter)) return "ltr";
  }
  return "auto";
}

export function textDirection(text: string): Direction {
  const firstLine = text.match(/^[ \t]*[^ \t\r\n][^\r\n]*/m)?.[0] ?? "";
  if (openingFence(firstLine) || INDENTED_CODE.test(firstLine)) return "ltr";
  return proseDirection(text);
}

/** Keep raw Markdown within each paragraph or code block, including its internal line endings. */
export function paragraphDirections(markdown: string): { text: string; dir: Direction }[] {
  const paragraphs: { text: string; dir: Direction }[] = [];
  let start = 0;
  let end = 0;
  let fence: string | undefined;
  let indentedCode = false;

  function flush() {
    if (start < end) {
      const text = markdown.slice(start, end);
      paragraphs.push({ text, dir: fence || indentedCode ? "ltr" : proseDirection(text) });
    }
    start = end;
    fence = undefined;
    indentedCode = false;
  }

  for (const match of markdown.matchAll(/([^\r\n]*)(?:\r\n?|\n|$)/g)) {
    const line = match[1]!;
    const at = match.index;
    if (fence) {
      end = at + line.length;
      if (line.match(FENCE_END)?.[1]?.startsWith(fence)) flush();
      continue;
    }
    if (!line.trim()) {
      if (!indentedCode) flush();
      continue;
    }

    const opener = openingFence(line);
    const indented = INDENTED_CODE.test(line);
    if (opener || (indentedCode && !indented)) flush();
    if (start === end) {
      start = at;
      fence = opener;
      indentedCode = indented;
    }
    end = at + line.length;
  }

  flush();
  return paragraphs;
}
