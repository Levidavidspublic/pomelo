export const DIAGRAM_LIMITS = Object.freeze({ maxChars: 20_000, maxLines: 500, maxFallbackChars: 2_000 });

const DIAGRAM_TYPES = [
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram",
  "erDiagram", "gantt", "pie", "mindmap", "timeline",
] as const;

type DiagramType = (typeof DIAGRAM_TYPES)[number];
type Refusal = { ok: false; reason: string; fallbackText: string };
type DiagramSourceCheck = { ok: true; type: DiagramType; source: string; dir: "rtl" | "ltr" } | Refusal;

const UNSAFE_URL_REASON = "Remove the unsafe URL from the diagram.";
const UNSAFE_SOURCE = [
  [/%%\{\s*(?:init(?:ialize)?|config)\b/i, "Remove the diagram configuration directive."],
  [/(?:^|[;\r\n])[^\S\r\n]*click[ \t]+\S+[ \t]+\S/i, "Remove the diagram click callback or link."],
  [/\bjavascript\s*:/i, UNSAFE_URL_REASON],
  [/(?:\]\((?:\s*<)?|\burl\((?:\s*["'])?)\s*data\s*:/i, UNSAFE_URL_REASON],
  [/<[a-z][^<>]*\s(?:href|src|srcset|poster|action|formaction|background)\s*=(?:\s*["'])?\s*data\s*:/i, UNSAFE_URL_REASON],
  // A data URL has a comma after the optional media type and parameters.
  [/\bdata:(?:[\w.+-]+\/[\w.+-]+)?(?:;[^\s<>"',]*)?,/i, UNSAFE_URL_REASON],
  [/<(?:script|iframe)\b|\bon[a-z][\w:-]*\s*=/i, "Remove the unsafe HTML from the diagram."],
] as const;

function refuse(reason: string, source = ""): Refusal {
  return { ok: false, reason, fallbackText: source.slice(0, DIAGRAM_LIMITS.maxFallbackChars) };
}

function labelDirection(body: string): "rtl" | "ltr" {
  // Prefer delimited labels, aliases, titles, and message text over diagram IDs and keywords.
  const labels = Array.from(
    body.matchAll(/"[^"\n]*"|\[[^\]\n]*\]|\([^\)\n]*\)|\{[^}\n]*\}|\|[^|\n]*\||(?::|\bas[ \t]+|^title[ \t]+)[ \t]*(.*)$/gm),
    ([label, prose]) => prose ?? label,
  );
  const text = (labels.length ? labels.join(" ") : body).replace(/<\/?[a-z][^<>\n]*>/gi, "");
  const letters = text.match(/\p{Letter}/gu) ?? [];
  const hebrewLetters = letters.filter((letter) => /\p{Script=Hebrew}/u.test(letter));
  return hebrewLetters.length > letters.length / 2 ? "rtl" : "ltr";
}

export function checkDiagramSource(source: unknown): DiagramSourceCheck {
  if (typeof source !== "string") return refuse("Give the diagram source as text.");
  if (source.length > DIAGRAM_LIMITS.maxChars) return refuse("Keep the diagram within 20,000 characters.", source);

  const lines = source.split(/\r\n?|\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > DIAGRAM_LIMITS.maxLines) return refuse("Keep the diagram within 500 lines.", source);

  const [header, ...body] = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("%%"));
  if (!header) return refuse("The diagram source is empty.", source);
  const keyword = header.split(/[\s;]/, 1)[0];
  const type = keyword === "stateDiagram-v2" ? "stateDiagram" : DIAGRAM_TYPES.find((name) => name === keyword);
  if (!type) return refuse("Start with a supported diagram type.", source);

  for (const [pattern, reason] of UNSAFE_SOURCE) {
    if (pattern.test(source)) return refuse(reason, source);
  }

  const dir = labelDirection([header.slice(keyword.length).trimStart(), ...body].join("\n"));
  return { ok: true, type, source, dir };
}
