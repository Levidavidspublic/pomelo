import assert from "node:assert/strict";
import { test } from "node:test";
import { checkArtifactBody } from "../src/pomelo/artifact-kind.js";

test("HTML accepts a page or fragment containing a tag", () => {
  for (const body of [
    "<!doctype html><html><body><p>Hello</p></body></html>",
    '<html lang="he" dir="rtl"><body>שָׁלוֹם</body></html>',
    '<img\n alt="A > B" src="example.png">',
  ]) {
    assert.deepEqual(checkArtifactBody("html", body), { ok: true, kind: "html" });
  }
});

test("HTML refuses prose and markup without an element tag", () => {
  for (const body of ["Only plain prose", "1 < 2 and 3 > 2", "<!doctype html>", "<!-- <p>example</p> -->"]) {
    assert.deepEqual(checkArtifactBody("html", body), {
      ok: false, kind: "html", reason: "The HTML body must contain a tag.",
    });
  }
});

test("Mermaid accepts a diagram keyword after blank lines and comments", () => {
  for (const body of [
    "flowchart TD\n  A --> B",
    "\r\n  %% example diagram\r\n\t\r\n%% another comment\r\n  graph TD; A --> B",
    "sequenceDiagram\n  Alice->>Bob: Hello",
    "classDiagram\n  class Example",
    "stateDiagram\n  [*] --> Ready",
    "stateDiagram-v2\n  [*] --> Ready",
    "erDiagram\n  A ||--o{ B : contains",
    "gantt\n  title Example",
    'pie\n  "Example" : 1',
    "mindmap\n  root",
    "timeline\n  title Example",
  ]) {
    assert.deepEqual(checkArtifactBody("mermaid", body), { ok: true, kind: "mermaid" });
  }
});

test("Mermaid refuses a body whose first content has no supported diagram keyword", () => {
  for (const body of ["<script></script>\ngraph TD", "flowchart-example TD", "%% graph TD"]) {
    assert.deepEqual(checkArtifactBody("mermaid", body), {
      ok: false, kind: "mermaid", reason: "Start the Mermaid body with a supported diagram keyword.",
    });
  }
});

test("chart accepts a JSON object", () => {
  assert.deepEqual(checkArtifactBody("chart", ' {"values":[1,2]} '), { ok: true, kind: "chart" });
});

test("chart refuses malformed JSON and JSON values other than objects", () => {
  for (const body of ["[1,2]", "{", "null", "42", "true", '"example"']) {
    assert.deepEqual(checkArtifactBody("chart", body), {
      ok: false, kind: "chart", reason: "The chart body must be a JSON object.",
    });
  }
});

test("image bodies are directed to the image bytes check", () => {
  assert.deepEqual(checkArtifactBody("image", "Example image text"), {
    ok: false, kind: "image", reason: "Use the image bytes check (#455) for image artifacts.",
  });
});

test("unknown kinds are refused", () => {
  assert.deepEqual(checkArtifactBody("markdown", "<p>Example</p>"), {
    ok: false, kind: "markdown", reason: "The artifact kind is unknown.",
  });
});

test("empty and whitespace-only bodies are refused", () => {
  for (const kind of ["html", "mermaid", "chart"]) {
    for (const body of ["", " \t\r\n\u00a0"]) {
      assert.deepEqual(checkArtifactBody(kind, body), {
        ok: false, kind, reason: "The artifact body is empty.",
      });
    }
  }
});

test("a NUL byte is refused even when the body contains an HTML tag", () => {
  assert.deepEqual(checkArtifactBody("html", "<p>Ex\0ample</p>"), {
    ok: false, kind: "html", reason: "The artifact body contains a NUL byte.",
  });
});

test("refusal reasons never repeat the body", () => {
  const canary = "example-body-canary";
  for (const kind of ["html", "mermaid", "chart", "image", "unknown"]) {
    const result = checkArtifactBody(kind, canary);
    assert.equal(result.ok, false);
    assert.ok(result.reason);
    assert.ok(!result.reason.includes(canary));
    assert.equal(result.reason, checkArtifactBody(kind, "other invalid text").reason);
  }
});
