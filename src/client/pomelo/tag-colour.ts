export const TAG_PALETTE = Object.freeze([
  "#3b3d41",
  "#55585d",
  "#73777e",
  "#a3a9b3",
  "#354659",
  "#4e6584",
  "#71839b",
  "#8fa3bf",
]);

function paletteColour(slug: string): string {
  // FNV-1a over UTF-16 code units gives the same slot in every JavaScript runtime.
  let hash = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    hash = Math.imul(hash ^ slug.charCodeAt(i), 16777619);
  }
  return TAG_PALETTE[(hash >>> 0) % TAG_PALETTE.length];
}

function linearChannel(hex: string): number {
  const srgb = Number.parseInt(hex, 16) / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = linearChannel(hex.slice(1, 3));
  const green = linearChannel(hex.slice(3, 5));
  const blue = linearChannel(hex.slice(5, 7));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function tagColour(slug: string, colour?: unknown): { bg: string; fg: "#ffffff" | "#000000" } {
  const bg = typeof colour === "string" && colour.length === 7 && /^#[0-9a-f]{6}$/i.test(colour)
    ? colour.toLowerCase()
    : paletteColour(slug);
  const fg = contrast(bg, "#ffffff") > contrast(bg, "#000000") ? "#ffffff" : "#000000";
  return { bg, fg };
}
