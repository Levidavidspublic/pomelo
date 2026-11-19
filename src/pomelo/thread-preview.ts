const cardLabels = {
  chart: "Chart",
  artifact: "Artifact",
  diagram: "Diagram",
  image: "Image",
  widget: "Widget",
} as const;

type PreviewKind = keyof typeof cardLabels | "message" | "agent.message" | "subagent_result" | "browser_job_result" | "tool_call";
type PreviewEvent = { kind?: unknown; text?: unknown; title?: unknown; toolName?: unknown };
type Preview = { text: string; kind: PreviewKind | "none" };
type PreviewOptions = { mask: (text: string) => string; maxLength?: number };

const DEFAULT_LENGTH = 80;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const oneLine = (text: string): string => text.replace(/[\s\u0085]+/g, " ").trim();

function flattenMarkdown(text: string): string {
  let fence: string | undefined;
  const lines: string[] = [];
  for (const line of text.split(/\r\n|[\n\r\u0085\u2028\u2029]/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1].startsWith(fence) && !marker[2].trim()) fence = undefined;
      else lines.push(line);
    } else if (marker) {
      fence = marker[1];
    } else {
      lines.push(line
        .replace(/^[ \t]{0,3}(?:>[ \t]?|(?:[-+*]|\d+[.)])[ \t]+)+/, "")
        .replace(/^ {0,3}#{1,6}(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/, "$1")
        .replace(/^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/, "")
        .replace(/!?\[([^\[\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
        .replace(/(\*{1,3}|~~)(?=\S)([^*~]*?\S)\1/g, "$2")
        .replace(/(?<![\p{L}\p{N}_])(_{1,3})(?=\S)([^_]*?\S)\1(?![\p{L}\p{N}_])/gu, "$2")
        .replace(/(?<!`)(`+)(?!`)(.*?)(?<!`)\1(?!`)/g, "$2"));
    }
  }
  return oneLine(lines.join(" "));
}

function clip(text: string, limit: number): string {
  let count = 0;
  let lastIndex = 0;
  for (const { index } of graphemes.segment(text)) {
    if (count === limit) return text.slice(0, lastIndex).trimEnd() + "…";
    count++;
    lastIndex = index;
  }
  return text;
}

/** Summarize a single activity using its text, card title, or tool name. The limit counts graphemes. */
export function threadPreview(event: unknown, options: PreviewOptions): Preview {
  const empty: Preview = { text: "", kind: "none" };
  try {
    if (!event || typeof event !== "object") return empty;
    const activity = event as PreviewEvent;
    const kind = activity.kind;
    let source: unknown;
    let label = "";
    switch (kind) {
      case "chart":
      case "artifact":
      case "diagram":
      case "image":
      case "widget":
        source = activity.title;
        label = cardLabels[kind];
        break;
      case "message":
      case "agent.message":
      case "subagent_result":
      case "browser_job_result":
        source = activity.text;
        break;
      case "tool_call":
        source = activity.toolName;
        break;
      default:
        return empty;
    }
    if (typeof source !== "string" || !source.trim()) return empty;

    const { mask, maxLength } = options;
    const limit = typeof maxLength === "number" && Number.isFinite(maxLength) ? Math.floor(maxLength) : DEFAULT_LENGTH;
    if (limit <= 0) return empty;

    // Mask before flattening so markup or whitespace changes cannot break a match.
    const masked = mask(source);
    if (typeof masked !== "string") return empty;
    const content = kind === "tool_call" ? oneLine(masked) : flattenMarkdown(masked);
    if (!content) return empty;
    const line = label ? `${label}: ${content}` : content;

    // Flattening can also bring fragments together to form a match.
    const safeLine = line === masked ? masked : mask(line);
    if (typeof safeLine !== "string") return empty;
    const text = oneLine(safeLine);
    return text ? { text: clip(text, limit), kind } : empty;
  } catch {
    // An unreadable event or failed mask yields no preview.
    return empty;
  }
}
