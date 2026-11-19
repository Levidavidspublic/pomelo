import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanChartCard } from "../src/pomelo/chart-card.js";
import { HIDDEN } from "../src/secrets.js";

const bar = {
  chart: "bar",
  title: "Travel times",
  labels: ["Train", "Bus"],
  series: [{ name: "Weekday", values: [18, 24] }],
};

function errorOf(args: unknown): string {
  const result = cleanChartCard(args);
  assert.ok("error" in result);
  return result.error;
}

test("cleans a bar chart and drops unknown fields at both levels", () => {
  assert.deepEqual(cleanChartCard({
    chart: "bar",
    title: "  Travel\n  times  ",
    note: "\t Average   time\nper trip ",
    labels: [" Express\t train ", " Bus "],
    series: [{ name: " Weekday    trips ", values: [18, 24], color: "blue" }],
    unit: " min ",
    extra: true,
  }), {
    card: {
      kind: "chart",
      chart: "bar",
      title: "Travel times",
      note: "Average time per trip",
      labels: ["Express train", "Bus"],
      series: [{ name: "Weekday trips", values: [18, 24] }],
      unit: "min",
    },
  });
});

test("keeps both series in a line chart and omits blank optional text", () => {
  const line = {
    ...bar,
    chart: "line",
    series: [...bar.series, { name: "Weekend", values: [-1, 2.5] }],
  };
  assert.deepEqual(cleanChartCard({ ...line, note: " \t ", unit: "\n" }), {
    card: { kind: "chart", ...line },
  });
});

test("requires exactly one series and nonnegative values for a pie chart", () => {
  const pie = { ...bar, chart: "pie", series: [{ name: "Trips", values: [0, 3] }] };
  assert.deepEqual(cleanChartCard(pie), { card: { kind: "chart", ...pie } });
  assert.match(errorOf({ ...pie, series: [...pie.series, ...bar.series] }), /one series/i);
  assert.match(errorOf({ ...pie, series: [{ name: "Trips", values: [-1, 3] }] }), /negative/i);
});

test("rejects invalid chart inputs and requires a nonblank title", () => {
  for (const args of [null, undefined, "bar", 42, []]) {
    assert.match(errorOf(args), /object/i);
  }
  assert.match(errorOf({ ...bar, chart: "scatter" }), /bar, line, or pie/i);
  for (const title of [undefined, " \n ", 42]) {
    assert.match(errorOf({ ...bar, title }), /title/i);
  }
});

test("bounds the number of labels and series", () => {
  assert.match(errorOf({ ...bar, labels: [] }), /at least one label/i);
  assert.match(errorOf({ ...bar, series: [] }), /at least one series/i);
  assert.match(errorOf({ ...bar, labels: Array(201).fill("Stop") }), /200 labels/i);
  assert.match(errorOf({ ...bar, series: Array(13).fill(bar.series[0]) }), /12 series/i);

  const labels = Array.from({ length: 200 }, (_, index) => `Stop ${index + 1}`);
  const values = labels.map((_, index) => index);
  const series = Array.from({ length: 12 }, (_, index) => ({ name: `Route ${index + 1}`, values }));
  assert.deepEqual(cleanChartCard({ ...bar, labels, series }), {
    card: { kind: "chart", ...bar, labels, series },
  });
});

test("requires one finite number per label without coercion", () => {
  assert.match(errorOf({ ...bar, series: [{ name: "Weekday", values: [18] }] }), /one value per label/i);
  for (const value of [NaN, Infinity, "5"]) {
    assert.match(errorOf({ ...bar, series: [{ name: "Weekday", values: [18, value] }] }), /finite number/i);
  }
  const sparseValues = [18, 24];
  delete sparseValues[1];
  assert.match(errorOf({ ...bar, series: [{ name: "Weekday", values: sparseValues }] }), /finite number/i);
});

test("requires labels and series names to be strings", () => {
  assert.match(errorOf({ ...bar, labels: [null, "Bus"] }), /label.*text/i);
  assert.match(errorOf({ ...bar, series: [{ values: [18, 24] }] }), /series.*name/i);
});

test("caps every text field after cleaning", () => {
  assert.deepEqual(cleanChartCard({
    ...bar,
    title: ` ${"a".repeat(121)} `,
    note: "b".repeat(301),
    labels: ["c".repeat(61)],
    series: [{ name: "d".repeat(61), values: [1] }],
    unit: "e".repeat(13),
  }), {
    card: {
      kind: "chart",
      chart: "bar",
      title: "a".repeat(120),
      note: "b".repeat(300),
      labels: ["c".repeat(60)],
      series: [{ name: "d".repeat(60), values: [1] }],
      unit: "e".repeat(12),
    },
  });
});

test("hides key-shaped text in every field before truncating", () => {
  const canary = `sk-${"ObviouslyFakeCanary123".repeat(3)}`;
  const masked = `sk-…${HIDDEN}`;
  assert.deepEqual(cleanChartCard({
    ...bar,
    title: canary,
    note: canary,
    labels: [`  Route\t ${canary}  `],
    series: [{ name: canary, values: [1] }],
    unit: canary,
  }), {
    card: {
      kind: "chart",
      chart: "bar",
      title: masked,
      note: masked,
      labels: [`Route ${masked}`],
      series: [{ name: masked, values: [1] }],
      unit: masked.slice(0, 12).trimEnd(),
    },
  });
  assert.ok(!errorOf({ ...bar, chart: canary }).includes(canary));
});
