import { HIDDEN, hideSecrets } from "../../secrets.js";
import { textDirection } from "./text-direction.js";

const KIND_WORDS = {
  diagram: "Diagram",
  artifact: "Artifact",
  image: "Image",
  chart: "Chart",
  widget: "Widget",
} as const;

const MAX_LABEL_LENGTH = 120;
const graphemes = new Intl.Segmenter();

type CardLabelInput = {
  kind: string;
  title?: string;
  alt?: string;
  version?: number;
  chart?: string;
  series?: readonly { values: readonly number[] }[];
  body?: string | { type: string; options?: readonly string[] };
};

function plainText(value: string | undefined): string {
  const line = (value ?? "")
    .replace(/[\s\u0085]+/gu, " ")
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, "")
    .trim();
  if (line.includes(HIDDEN) || hideSecrets(line).hidden || /^(?:`{3,}|~{3,})/.test(line)) return "";

  const text = line
    .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.|data:)[^\s<>]+/gi, " ")
    .replace(/[`*_~#[\]<>\\|]/g, "")
    .trimStart()
    .replace(/^(?:(?:[-+]|\d{1,9}[.)]) +)+/, "")
    .replace(/ {2,}/g, " ")
    .trim();
  return hideSecrets(text).hidden ? "" : text;
}

function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const end = graphemes.segment(text).containing(limit - 1)?.index ?? limit - 1;
  return text.slice(0, end).trimEnd() + "…";
}

function cardDetails(card: CardLabelInput): string {
  switch (card.kind) {
    case "chart": {
      const { chart, series } = card;
      const type = chart === "bar" || chart === "line" || chart === "pie" ? `, ${chart}` : "";
      const count = series?.reduce((total, { values }) => total + values.length, 0);
      return type + (count === undefined ? "" : `, ${count} ${count === 1 ? "value" : "values"}`);
    }
    case "artifact": {
      const { version } = card;
      return version !== undefined && Number.isSafeInteger(version) && version > 0 ? `, version ${version}` : "";
    }
    case "widget": {
      const { body } = card;
      const count = typeof body === "object" && body.type === "select" ? body.options?.length : undefined;
      return count === undefined ? "" : `, ${count} ${count === 1 ? "choice" : "choices"}`;
    }
    default:
      return "";
  }
}

/** Build one spoken line from display text and card metadata. */
export function cardLabel<T extends CardLabelInput>(card: T) {
  if (!Object.hasOwn(KIND_WORDS, card.kind)) {
    return { kind: "Card", label: "Card", dir: "ltr" } as const;
  }
  const kind = KIND_WORDS[card.kind as keyof typeof KIND_WORDS];
  const text = plainText(card.kind === "image" ? card.alt : card.title);
  if (!text) return { kind, label: kind, dir: "ltr" } as const;

  const prefix = `${kind}: `;
  const details = cardDetails(card);
  const label = prefix + shorten(text, MAX_LABEL_LENGTH - prefix.length - details.length) + details;
  return { kind, label, dir: textDirection(text) };
}
