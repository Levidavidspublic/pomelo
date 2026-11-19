import { hideSecrets } from "../secrets.js";

export type ChartCard = {
  kind: "chart";
  chart: "bar" | "line" | "pie";
  title: string;
  note?: string;
  labels: string[];
  series: { name: string; values: number[] }[];
  unit?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return hideSecrets(value.replace(/\s+/g, " ").trim()).text.slice(0, limit).trimEnd();
}

/** Clean an agent's chart arguments into data for a renderer. */
export function cleanChartCard(args: unknown): { card: ChartCard } | { error: string } {
  if (!isRecord(args)) return { error: "Provide the chart as an object." };
  const { chart, labels: rawLabels, series: rawSeries } = args;
  if (chart !== "bar" && chart !== "line" && chart !== "pie") {
    return { error: "Choose bar, line, or pie for the chart type." };
  }
  const title = cleanText(args.title, 120);
  if (!title) return { error: "Give the chart a title." };

  if (!Array.isArray(rawLabels) || !rawLabels.length) return { error: "A chart needs at least one label." };
  if (rawLabels.length > 200) return { error: "Use at most 200 labels." };
  if (!Array.isArray(rawSeries) || !rawSeries.length) return { error: "A chart needs at least one series." };
  if (rawSeries.length > 12) return { error: "Use at most 12 series." };
  if (chart === "pie" && rawSeries.length !== 1) return { error: "A pie chart needs exactly one series." };

  const labels: string[] = [];
  for (const label of rawLabels) {
    if (typeof label !== "string") return { error: "Every chart label must be text." };
    labels.push(cleanText(label, 60));
  }

  const series: ChartCard["series"] = [];
  for (const entry of rawSeries) {
    if (!isRecord(entry) || typeof entry.name !== "string") {
      return { error: "Give each series a text name." };
    }
    if (!Array.isArray(entry.values) || entry.values.length !== labels.length) {
      return { error: "Give each series exactly one value per label." };
    }
    const values: number[] = [];
    for (const value of entry.values) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { error: "Use a finite number for every chart value." };
      }
      if (chart === "pie" && value < 0) return { error: "Use only nonnegative values in a pie chart." };
      values.push(value);
    }
    series.push({ name: cleanText(entry.name, 60), values });
  }

  const note = cleanText(args.note, 300);
  const unit = cleanText(args.unit, 12);
  return { card: { kind: "chart", chart, title, labels, series, ...(note ? { note } : {}), ...(unit ? { unit } : {}) } };
}
