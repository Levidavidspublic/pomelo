import { ARTIFACT_KINDS, type Artifact } from "./artifact.js";

type ArtifactBodyCheck =
  | { ok: true; kind: Exclude<Artifact["kind"], "image">; reason?: never }
  | { ok: false; kind: string; reason: string };

const MERMAID_KEYWORDS = new Set([
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram", "stateDiagram-v2",
  "erDiagram", "gantt", "pie", "mindmap", "timeline",
]);

function hasHtmlTag(body: string): boolean {
  // Match comments as a unit so that tags inside them do not count.
  const markup = /<!--[\s\S]*?(?:-->|$)|<\/?[a-z][\w:-]*(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'"<>])*>/gi;
  for (const [match] of body.matchAll(markup)) {
    if (!match.startsWith("<!--")) return true;
  }
  return false;
}

function hasMermaidKeyword(body: string): boolean {
  for (const line of body.split(/\r\n?|\n/)) {
    const start = line.trimStart();
    if (start && !start.startsWith("%%")) {
      return MERMAID_KEYWORDS.has(start.split(/[\s;]/, 1)[0]);
    }
  }
  return false;
}

function isChartObject(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/** Check whether a text body fits the claimed artifact kind. */
export function checkArtifactBody(kind: string, bodyText: string): ArtifactBodyCheck {
  const knownKind = ARTIFACT_KINDS.find((candidate) => candidate === kind);
  if (!knownKind) return { ok: false, kind, reason: "The artifact kind is unknown." };
  if (knownKind === "image") {
    return { ok: false, kind, reason: "Use the image bytes check (#455) for image artifacts." };
  }
  if (!bodyText.trim()) return { ok: false, kind, reason: "The artifact body is empty." };
  if (bodyText.includes("\0")) return { ok: false, kind, reason: "The artifact body contains a NUL byte." };

  if (knownKind === "html" && !hasHtmlTag(bodyText)) {
    return { ok: false, kind, reason: "The HTML body must contain a tag." };
  }
  if (knownKind === "mermaid" && !hasMermaidKeyword(bodyText)) {
    return { ok: false, kind, reason: "Start the Mermaid body with a supported diagram keyword." };
  }
  if (knownKind === "chart" && !isChartObject(bodyText)) {
    return { ok: false, kind, reason: "The chart body must be a JSON object." };
  }
  return { ok: true, kind: knownKind };
}
