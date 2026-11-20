import assert from "node:assert/strict";
import test from "node:test";
import { cardLabel } from "../src/client/pomelo/card-label.js";

test("a diagram label uses the title and omits Mermaid source", () => {
  assert.deepEqual(cardLabel({
    kind: "diagram",
    title: "Release steps",
    body: "flowchart TD\n  A --> B",
  }), { kind: "Diagram", label: "Diagram: Release steps", dir: "ltr" });
});

test("an artifact label uses its title and version", () => {
  assert.deepEqual(cardLabel({
    kind: "artifact",
    title: "Landing page",
    version: 3,
    body: "<main>Draft copy</main>",
  }), { kind: "Artifact", label: "Artifact: Landing page, version 3", dir: "ltr" });
});

test("an image label uses alt text and falls back to Image when alt is empty", () => {
  const image = { kind: "image", title: "Preview", src: "images/preview.png" };
  assert.deepEqual(cardLabel({ ...image, alt: "A blue cabin" }), {
    kind: "Image", label: "Image: A blue cabin", dir: "ltr",
  });
  for (const alt of [undefined, "", " \t\n "]) {
    assert.deepEqual(cardLabel({ ...image, alt }), { kind: "Image", label: "Image", dir: "ltr" });
  }
});

test("a chart label gives the chart type and total number of values across series", () => {
  assert.deepEqual(cardLabel({
    kind: "chart",
    title: "Monthly sales",
    chart: "bar",
    labels: ["January", "February", "March"],
    series: [
      { name: "East", values: [11, 22, 33] },
      { name: "West", values: [44, 55, 66] },
    ],
  }), { kind: "Chart", label: "Chart: Monthly sales, bar, 6 values", dir: "ltr" });
});

test("a select widget label gives the number of choices", () => {
  assert.deepEqual(cardLabel({
    kind: "widget",
    title: "Time range",
    body: { type: "select", label: "Period", options: ["Week", "Month"] },
  }), { kind: "Widget", label: "Widget: Time range, 2 choices", dir: "ltr" });
  assert.equal(cardLabel({
    kind: "widget",
    title: "Filter",
    body: { type: "text", label: "Search terms" },
  }).label, "Widget: Filter");
});

test("a missing or whitespace-only title falls back to the kind word", () => {
  for (const [kind, word] of [
    ["diagram", "Diagram"],
    ["artifact", "Artifact"],
    ["chart", "Chart"],
    ["widget", "Widget"],
  ]) {
    for (const title of [undefined, "", " \n\t "]) {
      assert.deepEqual(cardLabel({ kind, title, version: 3, chart: "line" }), {
        kind: word, label: word, dir: "ltr",
      });
    }
  }
});

test("a Hebrew title stays whole and determines direction before the kind prefix", () => {
  assert.deepEqual(cardLabel({ kind: "diagram", title: "שָׁלוֹם Release" }), {
    kind: "Diagram", label: "Diagram: שָׁלוֹם Release", dir: "rtl",
  });
});

test("a title becomes a plain single line without Markdown or link destinations", () => {
  assert.equal(cardLabel({
    kind: "diagram",
    title: "> - **Release**\r\n[plan](https://example.test/draft_(one))\u2028_notes_",
  }).label, "Diagram: Release plan notes");
});

test("a long title is shortened at a whole character and retains the version", () => {
  const grapheme = "👩🏽‍💻";
  const title = "Preview " + grapheme.repeat(40);
  const { label } = cardLabel({ kind: "artifact", title, version: 3 });
  const match = /^Artifact: Preview (.+)…, version 3$/u.exec(label);
  assert.ok(match);
  assert.ok(label.length <= 120);
  const kept = match[1]!;
  assert.ok(kept.length < grapheme.repeat(40).length);
  assert.equal(kept, grapheme.repeat(Math.floor(kept.length / grapheme.length)));
});

test("key-shaped and previously masked metadata fall back to the kind word", () => {
  const fakeKey = "sk-" + "a".repeat(40);
  assert.equal(cardLabel({ kind: "artifact", title: "Draft " + fakeKey, version: 3 }).label, "Artifact");
  assert.equal(cardLabel({ kind: "diagram", title: "Draft [secret hidden]" }).label, "Diagram");
  assert.equal(cardLabel({ kind: "image", alt: "Bearer " + "b".repeat(20) }).label, "Image");
});

test("an unknown card kind yields Card, including names inherited from Object", () => {
  for (const kind of ["other", "constructor", "__proto__"]) {
    assert.deepEqual(cardLabel({ kind, title: "Ignore this" }), { kind: "Card", label: "Card", dir: "ltr" });
  }
});
