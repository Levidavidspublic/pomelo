import assert from "node:assert/strict";
import test from "node:test";
import { ARTIFACT_TITLE_MAX, cleanArtifactTitle } from "../src/pomelo/artifact-title.js";
import { HIDDEN } from "../src/secrets.js";

test("plain English, Hebrew with niqqud, and mixed titles stay intact", () => {
  for (const title of ["Quarterly report", "דּוּחַ שְׁנָתִי", "דּוּחַ Q4"]) {
    assert.deepEqual(cleanArtifactTitle(title, "html"), { title, changed: false, fellBack: false });
  }
});

test("whitespace collapses to one line and control characters are removed", () => {
  assert.deepEqual(cleanArtifactTitle("  Sales\r\n\t  re\u0000port\u0085for Q4\u2028 ", "chart"), {
    title: "Sales report for Q4",
    changed: true,
    fellBack: false,
  });
});

test("direction controls are removed from mixed Hebrew and English", () => {
  assert.deepEqual(cleanArtifactTitle("\u2067דּוּחַ\u2069 \u202EQ4\u202C", "chart"), {
    title: "דּוּחַ Q4",
    changed: true,
    fellBack: false,
  });
});

test("HTML tags and edge Markdown are stripped", () => {
  for (const raw of ["<b>Report</b>", "## Report", "## **_Report_** ##", '<b title="Section > 1">Report</b>']) {
    assert.deepEqual(cleanArtifactTitle(raw, "html"), { title: "Report", changed: true, fellBack: false });
  }
  const title = "C# and a*b with 1 < 2";
  assert.deepEqual(cleanArtifactTitle(title, "html"), { title, changed: false, fellBack: false });
});

test("Friday's shield hides a synthetic key before the length limit is applied", () => {
  const key = "sk-" + "ant-" + "api03-" + "x".repeat(100);
  for (const raw of [`## Report ${key}`, `Report<b>${key}</b>`]) {
    const result = cleanArtifactTitle(raw, "html");
    assert.ok(result.title.startsWith("Report "));
    assert.ok(result.title.endsWith(HIDDEN));
    assert.ok(!result.title.includes("x"));
    assert.equal(result.changed, true);
    assert.equal(result.fellBack, false);
  }
});

test("long titles fit 80 characters including the ellipsis", () => {
  assert.equal(ARTIFACT_TITLE_MAX, 80);
  assert.deepEqual(cleanArtifactTitle("a".repeat(200), "html"), {
    title: "a".repeat(79) + "…",
    changed: true,
    fellBack: false,
  });
  const title = "a".repeat(80);
  assert.deepEqual(cleanArtifactTitle(title, "html"), { title, changed: false, fellBack: false });
});

test("truncation keeps an emoji pair and a Hebrew letter with its niqqud whole", () => {
  const prefix = "a".repeat(78);
  for (const grapheme of ["😀", "שָׁ", "👩‍💻"]) {
    assert.deepEqual(cleanArtifactTitle(`${prefix}${grapheme}xy`, "image"), {
      title: `${prefix}${grapheme}…`,
      changed: true,
      fellBack: false,
    });
  }
});

test("unreadable titles fall back by kind", () => {
  const kinds = [
    ["html", "Untitled page"],
    ["mermaid", "Untitled diagram"],
    ["diagram", "Untitled diagram"],
    ["chart", "Untitled chart"],
    ["image", "Untitled image"],
    ["constructor", "Untitled artifact"],
  ];
  for (const [kind, title] of kinds) {
    assert.deepEqual(cleanArtifactTitle(" \t\u0000\u007F\u2066\n ", kind), {
      title,
      changed: true,
      fellBack: true,
    });
  }
  assert.deepEqual(cleanArtifactTitle("<b> ** </b>", "html"), {
    title: "Untitled page",
    changed: true,
    fellBack: true,
  });
});

test("non-string values fall back without coercion", () => {
  for (const raw of [42, undefined]) {
    assert.deepEqual(cleanArtifactTitle(raw, "image"), {
      title: "Untitled image",
      changed: true,
      fellBack: true,
    });
  }
});
