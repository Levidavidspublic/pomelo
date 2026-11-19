import assert from "node:assert/strict";
import { test } from "node:test";
import { chartShapes } from "../src/client/pomelo/chart-shapes.js";
import type { ChartCard } from "../src/pomelo/chart-card.js";

const sales: ChartCard = {
  kind: "chart",
  chart: "bar",
  title: "Sales",
  labels: ["January", "February", "March"],
  series: [{ name: "Sales", values: [14, 28, 42] }],
  unit: "USD",
};
const box = { width: 300, height: 120 };

test("draws proportional bars inside the box with a summary", () => {
  const result = chartShapes(sales, box);
  assert.equal(result.kind, "bar");
  assert.equal(result.summary, "Sales: highest is March at 42 USD");
  assert.equal(result.zeroY, box.height);
  assert.deepEqual(result.bars.map(({ height }) => height), [40, 80, 120]);
  assert.deepEqual(result.bars.map(({ label, value, series }) => ({ label, value, series })), [
    { label: "January", value: 14, series: 0 },
    { label: "February", value: 28, series: 0 },
    { label: "March", value: 42, series: 0 },
  ]);
  for (const bar of result.bars) {
    assert.ok(bar.x >= 0 && bar.width > 0 && bar.x + bar.width <= box.width);
    assert.ok(bar.y >= 0 && bar.y + bar.height === result.zeroY);
  }
  assert.equal(result.bars[2].y, 0);
});

test("groups series by label with no overlapping bars", () => {
  const result = chartShapes({
    ...sales,
    series: [...sales.series, { name: "Other sales", values: [21, 35, 7] }],
  }, { width: 301.23, height: 120 });
  assert.equal(result.kind, "bar");
  const bars = [...result.bars].sort((a, b) => a.x - b.x);
  assert.deepEqual(bars.map(({ label }) => label), ["January", "January", "February", "February", "March", "March"]);
  assert.deepEqual(bars.map(({ series }) => series), [0, 1, 0, 1, 0, 1]);
  for (let index = 1; index < bars.length; index++) {
    const previous = bars[index - 1];
    assert.ok(previous.x + previous.width <= bars[index].x);
  }
});

test("draws negative bars below zero and positive bars above it", () => {
  const result = chartShapes({ ...sales, series: [{ name: "Net sales", values: [-10, 0, 30] }] }, box);
  assert.equal(result.kind, "bar");
  assert.ok(result.zeroY > 0 && result.zeroY < box.height);
  assert.equal(result.bars[0].y, result.zeroY);
  assert.equal(result.bars[0].y + result.bars[0].height, box.height);
  assert.equal(result.bars[1].height, 0);
  assert.equal(result.bars[2].y + result.bars[2].height, result.zeroY);
});

test("draws evenly spaced line points for every label in each series", () => {
  const result = chartShapes({
    ...sales,
    chart: "line",
    series: [...sales.series, { name: "Other sales", values: [0, -14, 28] }],
  }, box);
  assert.equal(result.kind, "line");
  assert.equal(result.zeroY, 90);
  assert.deepEqual(result.lines, [
    { series: 0, points: [
      { x: 0, y: 60, label: "January", value: 14 },
      { x: 150, y: 30, label: "February", value: 28 },
      { x: 300, y: 0, label: "March", value: 42 },
    ] },
    { series: 1, points: [
      { x: 0, y: 90, label: "January", value: 0 },
      { x: 150, y: 120, label: "February", value: -14 },
      { x: 300, y: 30, label: "March", value: 28 },
    ] },
  ]);
});

test("centers a single line point and keeps coordinates inside a fractional box", () => {
  const result = chartShapes({
    ...sales,
    chart: "line",
    labels: ["January"],
    series: [{ name: "Net sales", values: [-5] }],
    unit: undefined,
  }, { width: 121.145, height: 100.126 });
  assert.equal(result.kind, "line");
  assert.equal(result.summary, "Sales: highest is January at -5");
  assert.equal(result.zeroY, 0);
  assert.deepEqual(result.lines[0].points, [{ x: 60.57, y: 100.12, label: "January", value: -5 }]);
});

test("draws proportional pie slices over a full turn, skipping zero values", () => {
  const result = chartShapes({ ...sales, chart: "pie", series: [{ name: "Sales", values: [14, 0, 42] }] }, box);
  assert.equal(result.kind, "pie");
  assert.deepEqual(result.slices, [
    { start: 0, end: 1.57, label: "January", value: 14 },
    { start: 1.57, end: 6.28, label: "March", value: 42 },
  ]);
  const sweep = result.slices.reduce((total, { start, end }) => total + (end - start), 0);
  assert.ok(Math.abs(sweep - 2 * Math.PI) < 0.005);
});

test("uses text for pies with negative values or multiple series", () => {
  const pie = { ...sales, chart: "pie" } as const;
  const fallback = { kind: "text", summary: "Sales: highest is March at 42 USD" };
  assert.deepEqual(chartShapes({ ...pie, series: [{ name: "Sales", values: [-14, 28, 42] }] }, box), fallback);
  assert.deepEqual(chartShapes({ ...pie, series: [...sales.series, ...sales.series] }, box), fallback);
});

test("uses text when all values are zero or the box cannot be drawn", () => {
  for (const chart of ["bar", "line", "pie"] as const) {
    assert.deepEqual(chartShapes({ ...sales, chart, series: [{ name: "Sales", values: [0, 0, 0] }] }, box), {
      kind: "text", summary: "Sales: highest is January at 0 USD",
    });
    assert.deepEqual(chartShapes({ ...sales, chart }, { width: 0, height: 120 }), {
      kind: "text", summary: "Sales: highest is March at 42 USD",
    });
  }
});

test("keeps coordinates finite and rounded for the full range of finite chart values", () => {
  const largest = Number.MAX_VALUE;
  const fractionalBox = { width: 300.125, height: 120.125 };
  for (const chart of ["bar", "line"] as const) {
    const result = chartShapes({ ...sales, chart, series: [{ name: "Sales", values: [-largest, 0, largest] }] }, fractionalBox);
    assert.equal(result.kind, chart);
    assert.equal(result.zeroY, 60.06);
    const coordinates = result.kind === "bar"
      ? result.bars.flatMap(({ x, y, width, height }) => [x, y, width, height])
      : result.lines.flatMap(({ points }) => points.flatMap(({ x, y }) => [x, y]));
    for (const coordinate of coordinates) {
      assert.ok(Number.isFinite(coordinate));
      assert.equal(coordinate, Number(coordinate.toFixed(2)));
    }
  }
  const pie = chartShapes({ ...sales, chart: "pie", series: [{ name: "Sales", values: [largest, largest, 0] }] }, box);
  assert.equal(pie.kind, "pie");
  assert.deepEqual(pie.slices.map(({ end }) => end), [3.14, 6.28]);
});
