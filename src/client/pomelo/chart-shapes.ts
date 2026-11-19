import type { ChartCard } from "../../pomelo/chart-card.js";

type Point = { x: number; y: number; label: string; value: number };
type Bar = Point & { width: number; height: number; series: number };
type Slice = { start: number; end: number; label: string; value: number };

type ChartShapes =
  | { kind: "bar"; bars: Bar[]; zeroY: number; summary: string }
  | { kind: "line"; lines: { series: number; points: Point[] }[]; zeroY: number; summary: string }
  | { kind: "pie"; slices: Slice[]; summary: string }
  | { kind: "text"; summary: string };

function round(value: number): number {
  return Number(value.toFixed(2));
}

function plotSize(value: number): number {
  // Keep rounded chart edges within fractional box dimensions.
  const rounded = round(value);
  return rounded > value ? round(rounded - 0.01) : rounded;
}

/** Lay out a cleaned chart card in box coordinates. Pie angles are in radians. */
export function chartShapes(card: ChartCard, box: { width: number; height: number }): ChartShapes {
  const { labels, series } = card;
  let highest = -Infinity;
  let lowest = 0;
  let highestIndex = 0;
  for (const entry of series) {
    for (const [index, value] of entry.values.entries()) {
      if (value > highest) {
        highest = value;
        highestIndex = index;
      }
      lowest = Math.min(lowest, value);
    }
  }

  if (highest === -Infinity) return { kind: "text", summary: `${card.title}: no data` };
  const label = labels[highestIndex] || `point ${highestIndex + 1}`;
  const summary = `${card.title}: highest is ${label} at ${highest}${card.unit ? ` ${card.unit}` : ""}`;
  const width = plotSize(box.width);
  const height = plotSize(box.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || (highest === 0 && lowest === 0)) {
    return { kind: "text", summary };
  }

  if (card.chart === "pie") {
    if (series.length !== 1 || lowest < 0) return { kind: "text", summary };
    const values = series[0].values;
    // Scale before summing to keep the total finite even for very large values.
    const total = values.reduce((sum, value) => sum + value / highest, 0);
    const slices: Slice[] = [];
    let cumulative = 0;
    let start = 0;
    for (const [index, value] of values.entries()) {
      if (value === 0) continue;
      cumulative += value / highest;
      const end = round((cumulative / total) * (2 * Math.PI));
      slices.push({ start, end, label: labels[index], value });
      start = end;
    }
    return { kind: "pie", slices, summary };
  }

  // Normalize before subtracting so the range from a large negative to a large positive stays finite.
  const magnitude = Math.max(-lowest, highest);
  const top = Math.max(0, highest) / magnitude;
  const range = top - lowest / magnitude;
  const toY = (value: number) => round(height * ((top - value / magnitude) / range));
  const zeroY = toY(0);

  if (card.chart === "line") {
    const lines = series.map((entry, seriesIndex) => ({
      series: seriesIndex,
      points: entry.values.map((value, index) => ({
        x: round(width * (labels.length === 1 ? 0.5 : index / (labels.length - 1))),
        y: toY(value),
        label: labels[index],
        value,
      })),
    }));
    return { kind: "line", lines, zeroY, summary };
  }

  const groupWidth = width / labels.length;
  const slotWidth = (groupWidth * 0.8) / series.length;
  const bars = labels.flatMap((label, index) => series.map((entry, seriesIndex) => {
    const value = entry.values[index];
    const left = groupWidth * (index + 0.1) + slotWidth * (seriesIndex + 0.05);
    const x = round(left);
    const right = round(left + slotWidth * 0.9);
    const valueY = toY(value);
    return {
      x,
      y: Math.min(zeroY, valueY),
      width: round(right - x),
      height: round(Math.abs(zeroY - valueY)),
      series: seriesIndex,
      label,
      value,
    };
  }));
  return { kind: "bar", bars, zeroY, summary };
}
