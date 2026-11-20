export const DEFAULT_IMAGE_ASPECT_RATIO = 4 / 3;
export const MIN_IMAGE_ASPECT_RATIO = 1 / 4;
export const MAX_IMAGE_ASPECT_RATIO = 4;
export const CHAT_IMAGE_MAX_HEIGHT = 360; // CSS pixels
export const MAX_IMAGE_ALT_LENGTH = 240; // UTF-16 code units

export interface ImageFrameCard {
  readonly alt?: unknown;
  readonly title?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
}

export type ImageLoadState = "loading" | "loaded" | "failed";
export type ImageFrameSurface = "chat" | "panel";

export type ImageFrame = {
  box: { aspectRatio: number; maxHeight: number | null };
  alt: string;
} & ({ state: "loading" | "loaded" } | { state: "failed"; note: string; retry: false });

const graphemes = new Intl.Segmenter();

function oneLine(value: unknown): string {
  if (typeof value !== "string") return "";
  const line = value.replace(/[\s\u0085]+/gu, " ").trim();
  if (line.length <= MAX_IMAGE_ALT_LENGTH) return line;

  // Cut at the start of the first grapheme that would go past the limit.
  const end = graphemes.segment(line).containing(MAX_IMAGE_ALT_LENGTH)?.index;
  return line.slice(0, end ?? MAX_IMAGE_ALT_LENGTH).trimEnd();
}

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function imageFrame(card: ImageFrameCard, state: ImageLoadState, where: ImageFrameSurface): ImageFrame {
  const { width, height } = card;
  const aspectRatio = isDimension(width) && isDimension(height)
    ? Math.max(MIN_IMAGE_ASPECT_RATIO, Math.min(MAX_IMAGE_ASPECT_RATIO, width / height))
    : DEFAULT_IMAGE_ASPECT_RATIO;
  const box = { aspectRatio, maxHeight: where === "chat" ? CHAT_IMAGE_MAX_HEIGHT : null };
  const alt = oneLine(card.alt) || oneLine(card.title) || "Image";

  if (state === "failed") return { box, alt, state, note: "Could not load image.", retry: false };
  return { box, alt, state };
}
