import assert from "node:assert/strict";
import test from "node:test";
import { checkWhyLink, headingAnchors } from "../src/pomelo/why-link.js";

const docs = {
  "06-ROADMAP.md": [
    "## Phase 1",
    "## Kitchen rules (all phases)",
    "## Phase 1 — Threads and rich replies",
    "## שלום עולם",
    "## Phase 2",
    "## Sources",
  ].join("\n"),
  "01-PRD.md": "",
};

test("a why can point to a planning file or a heading in that file", () => {
  for (const why of [
    "06-ROADMAP.md#phase-1",
    "06-ROADMAP.md#kitchen-rules-all-phases",
    "06-ROADMAP.md#phase-1--threads-and-rich-replies",
    "06-ROADMAP.md",
    "01-PRD.md",
    "docs/harness/ (branch docs/harness-six-docs-2026-11-19) 06-ROADMAP.md#kitchen-rules-all-phases",
    "See [06-ROADMAP.md](docs/harness/06-ROADMAP.md#phase-1).",
  ]) {
    assert.deepEqual(checkWhyLink(why, docs), { ok: true, problems: [] }, why);
  }
});

test("an unknown file is named even if the caller supplies it", () => {
  const extraDocs = { ...docs, "Other.md": "## Phase 1" };
  assert.deepEqual(checkWhyLink("Other.md#phase-1", extraDocs), {
    ok: false,
    problems: [{ code: "file-unknown", reason: "The file Other.md is outside the six planning docs." }],
  });
  assert.equal(checkWhyLink("02-TRD.md", docs).problems[0]?.code, "file-unknown");
  assert.equal(checkWhyLink("archive/06-ROADMAP.md", docs).problems[0]?.code, "file-unknown");
});

test("a missing heading lists up to five anchors from the referenced file", () => {
  assert.deepEqual(checkWhyLink("06-ROADMAP.md#phase-9", docs), {
    ok: false,
    problems: [{
      code: "heading-missing",
      reason: "The heading #phase-9 is not in 06-ROADMAP.md.",
      near: ["phase-1", "kitchen-rules-all-phases", "phase-1--threads-and-rich-replies", "שלום-עולם", "phase-2"],
    }],
  });
  assert.deepEqual(checkWhyLink("01-PRD.md#phase-1", docs).problems[0]?.near, []);
});

test("a why needs a planning document reference", () => {
  for (const why of ["", " \t\n", "The roadmap explains the goal."]) {
    const result = checkWhyLink(why, docs);
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map((problem) => problem.code), ["why-missing"]);
  }
});

test("two references fail even when they point to the same file", () => {
  for (const why of ["06-ROADMAP.md, 01-PRD.md", "06-ROADMAP.md#phase-1 and 06-ROADMAP.md#phase-1"]) {
    const result = checkWhyLink(why, docs);
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.map((problem) => problem.code), ["more-than-one"]);
  }
});

test("Hebrew letters are preserved in plain and URL-encoded anchors", () => {
  assert.equal(checkWhyLink("06-ROADMAP.md#שלום-עולם", docs).ok, true);
  assert.equal(checkWhyLink(`06-ROADMAP.md#${encodeURIComponent("שלום-עולם")}`, docs).ok, true);
});

test("headings inside backtick and tilde fences are ignored", () => {
  const markdown = [
    "## Before",
    "````md",
    "## Hidden",
    "```",
    "## Still hidden",
    "````",
    "~~~md",
    "## Also hidden",
    "~~~",
    "## After ##",
  ].join("\r\n");
  assert.deepEqual(headingAnchors(markdown), ["before", "after"]);
  assert.equal(checkWhyLink("06-ROADMAP.md#hidden", { "06-ROADMAP.md": markdown }).problems[0]?.code, "heading-missing");
});

test("repeated headings use the next available numeric suffix", () => {
  assert.deepEqual(headingAnchors("## Name\n## NAME!"), ["name", "name-1"]);
  assert.deepEqual(headingAnchors("## Name\n## Name-1\n## Name"), ["name", "name-1", "name-2"]);
  assert.equal(checkWhyLink("06-ROADMAP.md#name-1", { "06-ROADMAP.md": "## Name\n## Name" }).ok, true);
});

test("underlined headings produce anchors in document order", () => {
  assert.deepEqual(headingAnchors("First\n=====\n\n## Second\n\nThird\n-----"), ["first", "second", "third"]);
});
