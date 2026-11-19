/** sRGB channels on the 0–255 scale, including fractional composite values. */
interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface Rgba extends Rgb {
  /** Opacity from 0 (transparent) to 1 (opaque). */
  readonly a: number;
}

export interface PomeloTokens {
  readonly canvas: string;
  readonly surface: string;
  readonly glass: Rgba;
  readonly text: string;
  readonly textSecondary: string;
  readonly accent: string;
  readonly divider: string;
}

export const GLASS_BLUR_PX = 20;

export const POMELO_TOKENS: Readonly<Record<"dark" | "light", PomeloTokens>> = Object.freeze({
  dark: Object.freeze({
    canvas: "#0E0F11",
    surface: "#16181C",
    glass: Object.freeze({ r: 28, g: 31, b: 36, a: 0.62 }),
    text: "#ECEEF1",
    textSecondary: "#A3A9B3",
    accent: "#8FA3BF",
    divider: "#2A2E35",
  }),
  light: Object.freeze({
    canvas: "#F6F7F8",
    surface: "#FFFFFF",
    glass: Object.freeze({ r: 255, g: 255, b: 255, a: 0.66 }),
    text: "#15171A",
    textSecondary: "#555C66",
    accent: "#4E6584",
    divider: "#DDE1E6",
  }),
});

export function parseHex(hex: unknown): Rgb | null {
  if (typeof hex !== "string" || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const digits = hex.slice(1);
  const full = digits.length === 3 ? digits.replace(/./g, "$&$&") : digits;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** Composite straight-alpha glass over an opaque sRGB backdrop. */
export function over(glass: Rgba, backdrop: Rgb): Rgb {
  const { a } = glass;
  return {
    r: a * glass.r + (1 - a) * backdrop.r,
    g: a * glass.g + (1 - a) * backdrop.g,
    b: a * glass.b + (1 - a) * backdrop.b,
  };
}

/** WCAG 2.2 relative luminance, using linearized sRGB channels. */
export function luminance(rgb: Rgb): number {
  const linearize = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const TEXT_TOKENS = ["text", "textSecondary", "accent"] as const;
type TextToken = (typeof TEXT_TOKENS)[number];

interface ContrastFailure {
  text: TextToken;
  on: "canvas" | "surface" | "glass-over-canvas" | "glass-over-surface";
  ratio: number;
}

/** Report each text pair below the minimum, including glass over each solid backdrop. */
export function checkTheme(tokens: PomeloTokens, min = 4.5): ContrastFailure[] {
  const readColor = (key: TextToken | "canvas" | "surface") => {
    const color = parseHex(tokens[key]);
    if (!color) throw new TypeError(`Invalid hex colour for ${key}`);
    return color;
  };

  const canvas = readColor("canvas");
  const surface = readColor("surface");
  const backgrounds = [
    ["canvas", canvas],
    ["surface", surface],
    ["glass-over-canvas", over(tokens.glass, canvas)],
    ["glass-over-surface", over(tokens.glass, surface)],
  ] as const;

  return TEXT_TOKENS.flatMap((text) => {
    const foreground = readColor(text);
    return backgrounds
      .map(([on, background]) => ({ text, on, ratio: contrastRatio(foreground, background) }))
      .filter(({ ratio }) => ratio < min);
  });
}
