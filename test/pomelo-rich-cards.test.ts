import assert from "node:assert/strict";
import { test } from "node:test";
import { ARTIFACT_SANDBOX, cleanPomeloCard } from "../src/pomelo/rich-cards.js";
import { HIDDEN } from "../src/secrets.js";

const validCards = [
  { kind: "diagram", title: "Flow", body: "flowchart TD\n  A --> B" },
  { kind: "artifact", title: "Report", body: "<h1>Report</h1>", version: 3 },
  { kind: "image", title: "Preview", src: "screenshots/preview.png" },
  { kind: "widget", title: "Settings", body: { type: "toggle", label: "Show details" } },
] as const;

for (const args of validCards) {
  test(`cleans a valid ${args.kind} card and drops extra fields`, () => {
    assert.deepEqual(cleanPomeloCard({ ...args, extra: true }), { card: { version: 1, ...args } });
  });

  test(`requires a title for a ${args.kind} card`, () => {
    const { title, ...untitled } = args;
    assert.match(errorOf(untitled), /title/i);
    assert.match(errorOf({ ...args, title: " \n " }), /title/i);
  });
}

function errorOf(args: unknown): string {
  const result = cleanPomeloCard(args);
  assert.ok("error" in result);
  return result.error;
}

test("lists the supported kinds in the error for an unknown kind", () => {
  assert.match(errorOf({ kind: "chart", title: "Chart" }), /diagram, artifact, image, widget/);
  assert.match(errorOf(null), /diagram, artifact, image, widget/);
});

test("validates the version and caps the title and note", () => {
  const [diagram] = validCards;
  for (const version of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", null]) {
    assert.match(errorOf({ ...diagram, version }), /version/i);
  }
  assert.deepEqual(cleanPomeloCard({ ...diagram, title: `  ${"A".repeat(130)}  `, note: "B".repeat(310) }), {
    card: { ...diagram, title: "A".repeat(120), note: "B".repeat(300), version: 1 },
  });
});

test("requires diagram and artifact bodies and rejects source over the size limits", () => {
  const [diagram, artifact] = validCards;
  for (const args of [diagram, artifact]) {
    for (const body of [undefined, " \n ", 42]) {
      assert.match(errorOf({ ...args, body }), /body/i);
    }
  }
  assert.match(errorOf({ ...diagram, body: "x".repeat(16 * 1024 + 1) }), /16 KiB/);
  assert.match(errorOf({ ...artifact, body: "界".repeat(44_000) }), /128 KiB/);
});

test("the artifact sandbox grants scripts only", () => {
  assert.deepEqual(ARTIFACT_SANDBOX.split(/\s+/), ["allow-scripts"]);
});

test("allows image data URLs and session-relative picture paths", () => {
  const image = validCards[2];
  for (const src of [
    "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
    "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
    " ./screenshots/a preview.webp ",
  ]) {
    assert.deepEqual(cleanPomeloCard({ ...image, src }), { card: { ...image, src: src.trim(), version: 1 } });
  }
});

test("rejects remote URLs, paths outside the session, and malformed image sources", () => {
  const image = validCards[2];
  for (const src of [
    "", "javascript:preview.png", "java\tscript:preview.png", "http://example.test/a.png", "https://example.test/a.png",
    "//example.test/a.png", "\\\\example.test\\a.png", "file:///a.png", "/a.png", "~/a.png", "C:\\a.png",
    "../a.png", "shots/../a.png", "shots/%2e%2e/a.png", "shots/a.png?download", "report.html",
    "data:text/html,preview.png", "data:image/png", "data:image/png;base64,", "data:image/png;base64,%%", "data:image/png,%00%z",
  ]) {
    assert.match(errorOf({ ...image, src }), /image/i, src);
  }
  assert.match(errorOf({ ...image, src: `data:image/png;base64,${"A".repeat(1024 * 1024)}` }), /image/i);
});

test("validates widget input types, labels, and the number and length of choices", () => {
  const widget = validCards[3];
  for (const type of ["text", "number", "toggle"]) {
    const body = { type, label: "x".repeat(61) };
    assert.deepEqual(cleanPomeloCard({ ...widget, body }), {
      card: { ...widget, body: { type, label: "x".repeat(60) }, version: 1 },
    });
  }
  assert.deepEqual(cleanPomeloCard({ ...widget, body: { type: "select", label: "Size", options: [" Small ", "x".repeat(61)] } }), {
    card: { ...widget, body: { type: "select", label: "Size", options: ["Small", "x".repeat(60)] }, version: 1 },
  });
  for (const body of [undefined, "text", { type: "password", label: "Value" }, { type: "text", label: " " }]) {
    assert.match(errorOf({ ...widget, body }), /widget/i);
  }
  for (const options of [["Small"], ["Small", " "], ["Small", " Small "], Array.from({ length: 13 }, (_, i) => `Choice ${i}`)]) {
    assert.match(errorOf({ ...widget, body: { type: "select", label: "Size", options } }), /options/i);
  }
});

test("hides fake keys in all text fields and rejects image sources the shield would change", () => {
  const canary = `sk-${"ObviouslyFakeCanary123".repeat(2)}`;
  const masked = `sk-…${HIDDEN}`;
  const [diagram, artifact, image, widget] = validCards;
  assert.deepEqual(cleanPomeloCard({ ...diagram, title: ` ${canary} `, note: canary, body: `flowchart TD\n  A[${canary}]` }), {
    card: { kind: "diagram", title: masked, note: masked, body: `flowchart TD\n  A[${masked}]`, version: 1 },
  });
  assert.deepEqual(cleanPomeloCard({ ...artifact, body: `<p>${canary}</p>` }), {
    card: { ...artifact, body: `<p>${masked}</p>` },
  });
  assert.deepEqual(cleanPomeloCard({ ...widget, body: { type: "select", label: canary, options: [canary, "Small"] } }), {
    card: { ...widget, body: { type: "select", label: masked, options: [masked, "Small"] }, version: 1 },
  });
  assert.match(errorOf({ ...image, src: `shots/${canary}.png` }), /image/i);
});
