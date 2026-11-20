import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartCardView } from "../src/client/pomelo/ChartCardView.js";
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

function render(card: ChartCard): string {
  const html = renderToStaticMarkup(createElement(ChartCardView, { card, ...box }));
  assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b|<script\b|\bhref\s*=|style="animation/i);
  return html;
}

test("renders a bar per value and names the SVG with the model summary", () => {
  const html = render(sales);
  assert.match(html, /^<svg\b[^>]*\brole="img"/);
  assert.equal(html.match(/<rect\b/g)?.length, sales.series[0].values.length);
  assert.match(html, /fill="var\(--pomelo-series-0\b/);
  assert.equal(html.match(/<title>(.*?)<\/title>/)?.[1], chartShapes(sales, box).summary);
});

test("renders one polyline per line series with the series colour", () => {
  const html = render({
    ...sales,
    chart: "line",
    series: [...sales.series, { name: "Returns", values: [2, 5, 4] }],
  });
  assert.equal(html.match(/<polyline\b/g)?.length, 2);
  assert.match(html, /stroke="var\(--pomelo-series-0\b/);
  assert.match(html, /stroke="var\(--pomelo-series-1\b/);
});

test("draws a single line value as a round mark at the model point", () => {
  const html = render({
    ...sales,
    chart: "line",
    labels: ["January"],
    series: [{ name: "Sales", values: [14] }],
  });
  assert.match(html, /<polyline\b[^>]*\bpoints="150,0 150,0"[^>]*\bstroke-linecap="round"/);
});

test("renders one path per nonzero pie slice", () => {
  const html = render({ ...sales, chart: "pie", series: [{ name: "Sales", values: [14, 0, 42] }] });
  assert.equal(html.match(/<path\b/g)?.length, 2);
  assert.match(html, /fill="var\(--pomelo-series-0\b/);
  assert.match(html, /fill="var\(--pomelo-series-1\b/);
});

test("renders a full pie as one path with two arcs", () => {
  const html = render({ ...sales, chart: "pie", series: [{ name: "Sales", values: [0, 0, 42] }] });
  assert.equal(html.match(/<path\b/g)?.length, 1);
  const path = html.match(/<path\b[^>]*\bd="([^"]+)"/)?.[1];
  assert.equal(path?.match(/\bA\b/g)?.length, 2);
});

test("renders the model summary as a plain paragraph when there is no data", () => {
  const card: ChartCard = { ...sales, labels: [], series: [] };
  assert.equal(render(card), `<p>${chartShapes(card, box).summary}</p>`);
});

test("escapes a script tag in the chart title", () => {
  const html = render({ ...sales, title: "Sales <script>" });
  assert.match(html, /<title>Sales &lt;script&gt;:/);
});
