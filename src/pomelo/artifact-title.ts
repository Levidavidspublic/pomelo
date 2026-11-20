import { hideSecrets } from "../secrets.js";

export const ARTIFACT_TITLE_MAX = 80;

const FALLBACK_TITLES = new Map([
  ["html", "Untitled page"],
  ["mermaid", "Untitled diagram"],
  ["diagram", "Untitled diagram"],
  ["chart", "Untitled chart"],
  ["image", "Untitled image"],
]);

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const HTML_TAG = /<!--[\s\S]*?-->|<\/?[a-z][\w:-]*(?=[ />])(?:"[^"]*"|'[^']*'|[^'"<>])*>/gi;
const READABLE = /[^\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{M}\p{Cs}]/u;

function normalizeTitle(text: string): string {
  const title = text
    .replace(/\p{White_Space}+/gu, " ")
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, "")
    .replace(HTML_TAG, " ")
    .replace(/ +/g, " ")
    .trim()
    .replace(/^#{1,6}(?: |$)(.*?)(?: #+)?$/, "$1");

  if (/^[*_]/.test(title) && /[*_]$/.test(title)) {
    return title.replace(/^[*_]+|(?<![*_])[*_]+$/g, "").trim();
  }
  return title;
}

function truncateTitle(title: string): string {
  let count = 0;
  let lastIndex = 0;
  for (const { index } of GRAPHEMES.segment(title)) {
    // Once overflow is confirmed, replace the last cluster that would fit with the ellipsis.
    if (count === ARTIFACT_TITLE_MAX) return `${title.slice(0, lastIndex)}…`;
    lastIndex = index;
    count++;
  }
  return title;
}

export function cleanArtifactTitle(raw: unknown, kind: string): { title: string; changed: boolean; fellBack: boolean } {
  const cleaned = typeof raw === "string" ? normalizeTitle(raw) : "";
  if (!READABLE.test(cleaned) || /^[#*_ ]+$/.test(cleaned)) {
    return { title: FALLBACK_TITLES.get(kind) ?? "Untitled artifact", changed: true, fellBack: true };
  }

  const title = truncateTitle(hideSecrets(cleaned).text);
  return { title, changed: title !== raw, fellBack: false };
}
