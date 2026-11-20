export type CopyMode = "plain" | "markdown";
export type CopyCardKind = "diagram" | "artifact" | "image" | "chart" | "widget";
export type CopyPart =
  | { kind: "text"; markdown: string }
  | { kind: "card"; cardKind: CopyCardKind; title: string; note?: string };
export type CopyResult = { text: string; cards: number };

const CARD_TITLES: Record<CopyCardKind, string> = {
  diagram: "Diagram",
  artifact: "Artifact",
  image: "Image",
  chart: "Chart",
  widget: "Widget",
};

const INVISIBLE = /[\x00\p{Default_Ignorable_Code_Point}]/gu;
const OPEN_FENCE = /^ {0,3}(\x60{3,}(?=[^\x60]*$)|~{3,})/;
const CLOSE_FENCE = /^ {0,3}(\x60{3,}|~{3,})[ \t]*$/;
const QUOTE_PREFIX = /^(?: {0,3}>[ \t]?)+/;
const LIST_PREFIX = /^ {0,3}(?:[-+*]|\d{1,9}[.)]) {1,4}/;
const INDENTED_CODE = /^(?: {4}| {0,3}\t)/;
const HEADING = /^ {0,3}#{1,6}(?=[ \t]|$)/;
const UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;

type Line = { content: string; ending: string; code?: boolean };

function plainLine(line: string): string {
  const literals: string[] = [];
  // NUL is removed at input, so literal spans and addresses can use it as a delimiter.
  const keep = (text: string) => `\0${literals.push(text) - 1}\0`;
  const restore = (text: string) => text.replace(/\0(\d+)\0/g, (_placeholder, index: string) => literals[Number(index)]!);
  const heading = HEADING.test(line)
    ? line.replace(/[ \t]+#+[ \t]*$/, "").replace(HEADING, "").replace(/^[ \t]+/, "")
    : line;

  const plain = heading
    .replace(/(?<![\\\x60])(\x60+)(?!\x60)(.+?)(?<!\x60)\1(?!\x60)/g, keep)
    .replace(/(?<!\\)\[((?:\\.|[^\]\\])*)\]\((<[^>]*>|(?:\\.|[^\s()\\]|\([^()]*\))*)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^()]*\)))?[ \t]*\)/g,
      (_link, label: string, address: string) => `${label} ${keep(`(${restore(address).replace(/^<(.*)>$/, "$1")})`)}`)
    .replace(/(?<!\\)(\*{1,3})(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(?<![\\\x60*])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g, "$1")
    .replace(/(?<![\p{L}\p{N}\\_])(_{1,3})(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}_])/gu, "$2")
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_\x60{|}~])/g, "$1");
  return restore(plain);
}

function messageLines(markdown: string, mode: CopyMode): Line[] {
  const lines: Line[] = [];
  for (const [, content, ending] of markdown.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    if (content || ending) lines.push({ content, ending });
  }

  let fence: { marker: string; quoteDepth: number; indent: string } | undefined;
  let indentedThrough = -1;
  const result: Line[] = [];
  for (const [index, line] of lines.entries()) {
    const quote = QUOTE_PREFIX.exec(line.content)?.[0] ?? "";
    const quoteDepth = quote.match(/>/g)?.length ?? 0;
    const afterQuote = line.content.slice(quote.length);
    const listPrefix = LIST_PREFIX.exec(afterQuote)?.[0] ?? "";
    const opening = OPEN_FENCE.exec(afterQuote.slice(listPrefix.length))?.[1];
    const fenceLine = fence?.quoteDepth ? afterQuote : line.content;
    if (fence && (quoteDepth < fence.quoteDepth || (fenceLine.trim() && !fenceLine.startsWith(fence.indent)))) {
      fence = undefined;
    }

    if (fence) {
      line.code = true;
      if (!fence.quoteDepth || quoteDepth === fence.quoteDepth) {
        const closing = CLOSE_FENCE.exec(fenceLine.slice(fence.indent.length))?.[1];
        if (closing?.[0] === fence.marker[0] && closing.length >= fence.marker.length) fence = undefined;
      }
    } else if (index <= indentedThrough) {
      line.code = true;
    } else if (opening) {
      fence = { marker: opening, quoteDepth, indent: " ".repeat(listPrefix.length) };
      line.code = true;
    } else if (INDENTED_CODE.test(line.content) && line.content.trim()) {
      const previous = result.at(-1);
      if (!previous || previous.code || !previous.content.trim()) {
        line.code = true;
        indentedThrough = index;
        for (let next = index + 1; next < lines.length; next++) {
          const content = lines[next]!.content;
          if (!content.trim()) continue;
          if (!INDENTED_CODE.test(content)) break;
          indentedThrough = next;
        }
      }
    }

    const content = line.content.replace(INVISIBLE, "");
    if (mode === "plain" && !line.code) {
      const previous = lines[index - 1];
      if (UNDERLINE.test(content) && previous && !previous.code && previous.content.trim()
        && !HEADING.test(previous.content) && !UNDERLINE.test(previous.content)) continue;
      const prefixLength = quote.length + listPrefix.length;
      result.push({ ...line, content: content.slice(0, prefixLength) + plainLine(content.slice(prefixLength)) });
    } else {
      result.push({ ...line, content });
    }
  }
  return result;
}

/** Format already masked reply text and card titles for a message copy action. */
export function copyTextFor(parts: readonly CopyPart[], mode: CopyMode): CopyResult {
  const lines: Line[] = [];
  let cards = 0;
  for (const part of parts) {
    if (part.kind === "card") {
      const title = part.title.replace(INVISIBLE, "").replace(/[\s\u0085]+/gu, " ").trim();
      lines.push({ content: `[${part.cardKind}: ${title || CARD_TITLES[part.cardKind]}]`, ending: "\n" });
      cards++;
    } else {
      for (const line of messageLines(part.markdown, mode)) lines.push(line);
    }
  }

  while (lines.length && !lines.at(-1)!.content.trim()) lines.pop();

  const text: string[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index++]!;
    if (line.code || line.content.trim()) {
      text.push(line.content + (line.ending || "\n"));
      continue;
    }

    // Count blank lines only in prose so code whitespace and line endings stay intact.
    const start = index - 1;
    while (index < lines.length && !lines[index]!.code && !lines[index]!.content.trim()) index++;
    if (index - start >= 3) {
      text.push(line.ending || "\n");
    } else {
      for (const blank of lines.slice(start, index)) text.push(blank.content + (blank.ending || "\n"));
    }
  }
  return { text: text.join(""), cards };
}
