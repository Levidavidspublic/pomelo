type Chunk = Readonly<{ text: string; lang: "he" | "en" }>;

const MAX_CHUNK_LENGTH = 200;
const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
const FENCE_START = /^[ \t]*(?:(\x60{3,})[^\x60]*|(~{3,}).*)$/;

function tableCells(line: string | undefined): string[] | undefined {
  // Escaped pipes belong to the cell.
  const row = line?.trim().replace(/\\./g, "x");
  if (row?.includes("|")) return row.replace(/^\||\|$/g, "").split("|");
}

function listText(line: string): string {
  return line.replace(/^(?:[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+)+(?:\[[ xX]\][ \t]+)?/, "");
}

function blocks(markdown: string): string {
  const lines = markdown.split(/\r\n?|\n/).map((line) => line.replace(/^(?:[ \t]*>[ \t]?)+/, ""));
  // A final newline ends the last line without adding another content line.
  if (lines.at(-1) === "") lines.pop();
  const parts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const prose = listText(line);
    const opening = FENCE_START.exec(prose);
    if (opening) {
      const fence = (opening[1] ?? opening[2])!;
      const first = ++i;
      while (i < lines.length) {
        const closing = lines[i]!.trim();
        if (closing.length >= fence.length && closing === fence[0]!.repeat(closing.length)) break;
        i++;
      }
      const count = i - first;
      parts.push("Code block, " + count + (count === 1 ? " line." : " lines."));
      continue;
    }

    const header = tableCells(line);
    const separator = tableCells(lines[i + 1]);
    if (header && separator?.length === header.length && separator.every((cell) => /^:?-+:?$/.test(cell.trim()))) {
      const first = i;
      i++;
      while (tableCells(lines[i + 1])) i++;
      const count = i - first;
      parts.push("Table, " + count + (count === 1 ? " row." : " rows."));
      continue;
    }

    if (/^\s*(?:=+|-+|(?:\*\s*){3,}|(?:_\s*){3,}|(?:-\s*){3,})\s*$/.test(line)) continue;
    parts.push(prose.replace(/^[ \t]*#{1,6}(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/, "$1"));
  }

  return parts.join("\n");
}

function inline(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!?\[([^\]\n]*)\]\((?:<[^>\n]*>|(?:\\.|[^\s()\\]|\([^()\n]*\))*)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'))?[ \t]*\)/g, "$1")
    .replace(/<(https?:\/\/[^<>\s]+)>/gi, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-z][\w:-]*(?=\s|\/?>)(?:[^'"<>]|"[^"]*"|'[^']*')*>/gi, "")
    .replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\s)(?:\\.|[^\\$\n])+?(?<!\s)\$(?!\d)/g, " ")
    .replace(/\x60+([^\x60]+?)\x60+/g, "$1")
    .replace(/(?<!\\)(\*{1,3})(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(?<!\\)\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
    .replace(/(?<![\p{L}\p{N}\\])(_{1,3})(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu, "$2")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "$1")
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>"'\x60]+/gi, (address) => {
      const url = address.replace(/[.,!?;:)\]}]+$/, "");
      const hostname = URL.parse(/^www\./i.test(url) ? "https://" + url : url)?.hostname;
      return hostname ? hostname + address.slice(url.length) : address;
    })
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_\x60{|}~])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function chunk(text: string): Chunk {
  const firstLetter = text.match(/\p{L}/u)?.[0] ?? "";
  return Object.freeze({ text, lang: /\p{Script=Hebrew}/u.test(firstLetter) ? "he" : "en" });
}

/** Turn reply Markdown into immutable speech chunks, starting with the verdict sentence. */
export function speakable(markdown: string): readonly Chunk[] {
  const chunks: Chunk[] = [];
  for (const { segment } of sentences.segment(inline(blocks(markdown)))) {
    let text = "";
    for (const word of segment.trim().split(" ")) {
      if (text && text.length + 1 + word.length > MAX_CHUNK_LENGTH) {
        chunks.push(chunk(text));
        text = "";
      }
      if (word.length > MAX_CHUNK_LENGTH) {
        chunks.push(chunk("Long word omitted."));
      } else {
        text = text ? text + " " + word : word;
      }
    }
    if (text) chunks.push(chunk(text));
  }
  return Object.freeze(chunks);
}
