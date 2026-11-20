import { HIDDEN } from "../../secrets.js";
import { MASK } from "../mask.js";

export const HIDDEN_TEXT_MARKER = "[hidden text left out]";

export interface HiddenTextElement {
  /** Text from the already-masked read. */
  text: string;
  displayed?: boolean;
  visibility?: "visible" | "hidden" | "collapse";
  opacity?: number;
  /** Viewport-relative bounds in CSS pixels. */
  box?: { x?: number; y?: number; width?: number; height?: number };
  color?: string;
  /** Effective background behind the text. */
  backgroundColor?: string;
  ariaHidden?: boolean;
  /** The collector has verified that this element labels a form field. */
  labelsFormField?: boolean;
}

export interface HiddenTextWindow {
  width: number;
  height: number;
}

type HiddenTextReason =
  | "not-displayed" | "not-visible" | "zero-opacity" | "tiny-box"
  | "off-screen" | "transparent-text" | "same-color";

type KeptFlag = "screen-reader-label" | "unclear";

export interface HiddenTextResult {
  /** Indices refer to the original read, so callers can place omission markers in order. */
  kept: { index: number; element: HiddenTextElement; flag?: KeptFlag }[];
  dropped: { index: number; reason: HiddenTextReason; marker: typeof HIDDEN_TEXT_MARKER; maskMarkers?: string[] }[];
  droppedCount: number;
}

const maskPattern = new RegExp(
  [MASK, HIDDEN].map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "g",
);
const MAX_LABEL_LENGTH = 80;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type Color = { channels: [number, number, number]; alpha: number };

function colorNumber(part: string, max: number): number {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(part)) return NaN;
  const value = part.endsWith("%") ? Number(part.slice(0, -1)) / 100 * max : Number(part);
  return value <= max ? value : NaN;
}

function parseColor(value: unknown): Color | undefined {
  if (typeof value !== "string") return;
  const normalized = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(normalized)?.[1];
  if (hex) {
    const bytes = hex.length <= 4 ? Array.from(hex, (digit) => digit + digit) : hex.match(/../g)!;
    const [red, green, blue, alpha = 255] = bytes.map((byte) => Number.parseInt(byte, 16));
    return { channels: [red, green, blue], alpha: alpha / 255 };
  }

  const rgb = /^rgba?\(([^()]*)\)$/.exec(normalized)?.[1];
  if (!rgb) return;
  const commaSeparated = rgb.includes(",");
  const parts = commaSeparated ? rgb.split(",") : rgb.trim().replace(/\s*\/\s*/, " / ").split(/\s+/);
  if (!commaSeparated && parts.length > 3) {
    if (parts.length !== 5 || parts[3] !== "/") return;
    parts.splice(3, 1);
  }
  if (parts.length !== 3 && parts.length !== 4) return;
  const [red, green, blue] = parts.slice(0, 3).map((part) => colorNumber(part.trim(), 255));
  const alpha = parts.length === 4 ? colorNumber(parts[3].trim(), 1) : 1;
  if ([red, green, blue, alpha].every(Number.isFinite)) return { channels: [red, green, blue], alpha };
}

function classify(element: HiddenTextElement, window?: HiddenTextWindow | null): HiddenTextReason | "unclear" | undefined {
  const { displayed, visibility, opacity, box, ariaHidden } = element;
  if (displayed === false) return "not-displayed";
  if (visibility === "hidden" || visibility === "collapse") return "not-visible";
  if (opacity === 0) return "zero-opacity";

  const { x, y, width, height } = box ?? {};
  const hasSize = finite(width) && width >= 0 && finite(height) && height >= 0;
  if (hasSize && (width === 0 || height === 0 || (width <= 1 && height <= 1))) return "tiny-box";
  const hasPosition = hasSize && finite(x) && finite(y);
  const hasWindow = finite(window?.width) && window.width > 0 && finite(window.height) && window.height > 0;
  if (hasPosition && hasWindow && (x >= window.width || y >= window.height || x + width <= 0 || y + height <= 0)) {
    return "off-screen";
  }

  const text = parseColor(element.color);
  const background = parseColor(element.backgroundColor);
  if (text?.alpha === 0) return "transparent-text";
  if (text && background?.alpha === 1 && text.channels.every((channel, index) => channel === background.channels[index])) {
    return "same-color";
  }

  if (displayed !== true || visibility !== "visible" || !finite(opacity) || opacity < 0 || opacity > 1
    || !hasPosition || !hasWindow || !text || background?.alpha !== 1 || typeof ariaHidden !== "boolean") {
    return "unclear";
  }
}

function isScreenReaderLabel(element: HiddenTextElement): boolean {
  if (element.labelsFormField !== true || element.displayed !== true
    || element.visibility !== "visible" || element.ariaHidden !== false) return false;
  const label = element.text.trim();
  return label.length > 0 && label.length <= MAX_LABEL_LENGTH && !/[\r\n]/.test(label);
}

/** Filter plain element facts without changing the original masked read. */
export function dropHiddenText(elements: readonly HiddenTextElement[], window?: HiddenTextWindow | null): HiddenTextResult {
  const kept: HiddenTextResult["kept"] = [];
  const dropped: HiddenTextResult["dropped"] = [];
  if (!Array.isArray(elements)) return { kept, dropped, droppedCount: 0 };

  for (const [index, element] of elements.entries()) {
    if (!element || typeof element !== "object" || typeof element.text !== "string") continue;
    const reason = classify(element, window);
    if (!reason) {
      kept.push({ index, element });
    } else if (reason === "unclear") {
      kept.push({ index, element, flag: "unclear" });
    } else if (isScreenReaderLabel(element)) {
      kept.push({ index, element, flag: "screen-reader-label" });
    } else {
      // A mask may appear anywhere in page text. Preserve it without exempting the surrounding text.
      const masks = element.text.match(maskPattern);
      if (masks && !element.text.replace(maskPattern, "").trim()) {
        kept.push({ index, element });
      } else {
        dropped.push({ index, reason, marker: HIDDEN_TEXT_MARKER, ...(masks ? { maskMarkers: masks } : {}) });
      }
    }
  }
  return { kept, dropped, droppedCount: dropped.length };
}
