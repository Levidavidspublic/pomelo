import { secretField } from "../browser-driver.js";

export interface FieldBox {
  type?: string;
  autocomplete?: string;
  name?: string;
  filledByBroker?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns the whole-pixel masks for visible secret and broker-filled fields. */
export function maskRegions(fields: FieldBox[], viewport: { width: number; height: number }, pad = 2): Rect[] {
  const viewportWidth = Math.floor(viewport.width);
  const viewportHeight = Math.floor(viewport.height);
  if (![viewportWidth, viewportHeight, pad].every(Number.isFinite) || viewportWidth <= 0 || viewportHeight <= 0) return [];

  const padding = Math.max(0, pad);
  const regions: Rect[] = [];
  for (const field of fields) {
    if (field.filledByBroker !== true && !secretField(field)) continue;

    const { x, y, width, height } = field;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;

    // Check the unpadded box so padding cannot pull an off-screen field into view.
    const right = x + width;
    const bottom = y + height;
    if (right <= 0 || bottom <= 0 || x >= viewportWidth || y >= viewportHeight) continue;

    const leftPixel = Math.max(0, Math.floor(x - padding));
    const topPixel = Math.max(0, Math.floor(y - padding));
    const rightPixel = Math.min(viewportWidth, Math.ceil(right + padding));
    const bottomPixel = Math.min(viewportHeight, Math.ceil(bottom + padding));
    if (rightPixel > leftPixel && bottomPixel > topPixel) {
      regions.push({ x: leftPixel, y: topPixel, width: rightPixel - leftPixel, height: bottomPixel - topPixel });
    }
  }
  return regions;
}
