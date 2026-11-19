import assert from "node:assert/strict";
import test from "node:test";
import { checkDiagramSource, DIAGRAM_LIMITS } from "../src/client/pomelo/diagram-source.js";

const FLOWCHART = "flowchart TD\n  A[Start] --> B[Done]";

function expectRefusal(source: unknown, reason: RegExp): void {
  const result = checkDiagramSource(source);
  assert.ok(!result.ok);
  assert.match(result.reason, reason);
  assert.match(result.reason, /^[A-Z][^.?!<>\r\n]+\.$/);
  assert.equal(result.fallbackText, typeof source === "string" ? source.slice(0, 2_000) : "");
}

test("accepts a small flowchart and returns its original source", () => {
  assert.deepEqual(checkDiagramSource(FLOWCHART), {
    ok: true, type: "flowchart", source: FLOWCHART, dir: "ltr",
  });
});

test("skips blank and comment lines when finding the diagram type", () => {
  const source = " \r\n  %% A diagram note\r\n\r\n" + FLOWCHART;
  assert.deepEqual(checkDiagramSource(source), {
    ok: true, type: "flowchart", source, dir: "ltr",
  });
});

test("recognizes each supported diagram type", () => {
  const examples = {
    graph: "graph LR\n  A --> B",
    sequenceDiagram: "sequenceDiagram\n  A->>B: Hello",
    classDiagram: "classDiagram\n  class Example",
    stateDiagram: "stateDiagram\n  [*] --> Ready",
    erDiagram: "erDiagram\n  TEAM ||--o{ MEMBER : includes",
    gantt: "gantt\n  dateFormat YYYY-MM-DD\n  Work : 2026-01-01, 1d",
    pie: 'pie\n  "Work" : 1',
    mindmap: "mindmap\n  root((Ideas))",
    timeline: "timeline\n  2026 : Start",
  };
  for (const [type, source] of Object.entries(examples)) {
    assert.deepEqual(checkDiagramSource(source), { ok: true, type, source, dir: "ltr" });
  }
});

test("accepts stateDiagram-v2 as a state diagram and reads its labels", () => {
  const source = "stateDiagram-v2\n  Ready: כן";
  assert.deepEqual(checkDiagramSource(source), { ok: true, type: "stateDiagram", source, dir: "rtl" });
});

test("refuses init, initialize, and config directives even around the header", () => {
  for (const directive of ["%%{init: {}}%%", '%%{initialize: {"securityLevel":"loose"}}%%', "%%{ config: {} }%%"]) {
    expectRefusal(`${directive}\n${FLOWCHART}`, /directive/i);
    expectRefusal(`${FLOWCHART}\n${directive}`, /directive/i);
  }
});

test("refuses click callbacks and links on their own line or after a semicolon", () => {
  expectRefusal(`${FLOWCHART}\n  click A callback`, /click/i);
  expectRefusal(`${FLOWCHART}\r\nclick A href "https://example.test/"`, /click/i);
  expectRefusal(`${FLOWCHART}; click A "https://example.test/"`, /click/i);
  assert.equal(checkDiagramSource('flowchart TD\n  click["Click here"] --> B').ok, true);
});

test("refuses javascript and data URLs regardless of case", () => {
  for (const url of ["javascript:example", "JaVaScRiPt:example", "DATA:text/plain,example"]) {
    expectRefusal(`flowchart TD\n  A["[Link](${url})"]`, /URL/i);
  }
  expectRefusal(`flowchart TD\n  A["<img src='DATA:example'>"]`, /URL/i);
  expectRefusal('flowchart TD\n  A["data:text/plain;base64,ZXhhbXBsZQ=="]', /URL/i);
});

test("accepts ordinary data labels and task names", () => {
  for (const source of [
    "sequenceDiagram\n  Browser->>Data: fetch",
    "flowchart TD\n  A[Input data: CSV]",
    "gantt\n  dateFormat YYYY-MM-DD\n  Load data :a1, 2026-01-01, 1d",
  ]) {
    assert.equal(checkDiagramSource(source).ok, true, source);
  }
});

test("refuses script and iframe tags and event attributes in labels", () => {
  for (const label of ["<script>", "<IFRAME>", "<span ONCLICK = 'example'>Label</span>"]) {
    expectRefusal(`flowchart TD\n  A["${label}"]`, /HTML/i);
  }
  assert.equal(checkDiagramSource('flowchart TD\n  A["Start<br/>Done"]').ok, true);
});

test("accepts source at the size limits and refuses source above them", () => {
  assert.deepEqual(DIAGRAM_LIMITS, { maxChars: 20_000, maxLines: 500, maxFallbackChars: 2_000 });
  const atCharLimit = FLOWCHART.padEnd(20_000);
  assert.equal(checkDiagramSource(atCharLimit).ok, true);
  expectRefusal(`${atCharLimit} `, /characters/i);

  for (const newline of ["\n", "\r\n", "\r"]) {
    const atLineLimit = [FLOWCHART, ...Array<string>(498).fill("  %% note")].join(newline);
    assert.equal(checkDiagramSource(atLineLimit).ok, true);
    assert.equal(checkDiagramSource(atLineLimit + newline).ok, true);
    expectRefusal(`${atLineLimit}${newline}  %% one more line`, /lines/i);
    expectRefusal(atLineLimit + newline.repeat(2), /lines/i);
  }
});

test("checks size before type and type before unsafe content", () => {
  const unknown = "unknown\n%%{init: {}}%%";
  expectRefusal(unknown.padEnd(20_001), /characters/i);
  expectRefusal(`${unknown}${"\n".repeat(499)}overflow`, /lines/i);
  expectRefusal(unknown, /type/i);
});

test("refuses unrecognized types, empty source, and non-string input", () => {
  for (const source of ["unknown TD\nA --> B", "flowchart-extra TD\nA --> B", "constructor"]) {
    expectRefusal(source, /type/i);
  }
  for (const source of ["", " \n  %% a comment\n"]) {
    expectRefusal(source, /empty/i);
  }
  for (const source of [null, undefined, 0, false, Symbol(), [FLOWCHART], Object.create(null)]) {
    expectRefusal(source, /text/i);
  }
});

test("uses the majority of label letters to infer Hebrew direction", () => {
  const hebrew = "flowchart TD\n  start[כן] --> finish[לא]";
  assert.deepEqual(checkDiagramSource(hebrew), {
    ok: true, type: "flowchart", source: hebrew, dir: "rtl",
  });
  const mixed = "%% זו הערה בעברית\nflowchart TD\n  A[כן] --> B[Starting point]";
  assert.deepEqual(checkDiagramSource(mixed), {
    ok: true, type: "flowchart", source: mixed, dir: "ltr",
  });
  const sequence = "sequenceDiagram\n  Browser->>Service: כן";
  assert.deepEqual(checkDiagramSource(sequence), {
    ok: true, type: "sequenceDiagram", source: sequence, dir: "rtl",
  });
});
