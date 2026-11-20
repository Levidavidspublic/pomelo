import assert from "node:assert/strict";
import test from "node:test";
import { artifactPicker, pickerKey } from "../src/client/pomelo/artifact-picker.js";

const rows = [
  { artifactId: "report", kind: "html", title: "Report", version: 2, versionCount: 2, updatedAt: 3 },
  { artifactId: "flow", kind: "mermaid", title: "תרשים", version: 3, versionCount: 2, updatedAt: 2 },
  { artifactId: "sales", kind: "chart", title: "Sales", version: 1, versionCount: 1, updatedAt: 1 },
] as const;

test("an empty thread hides the picker and gives a plain spoken note", () => {
  const model = artifactPicker([], null);

  assert.equal(model.shown, false);
  assert.equal(model.note, "No artifacts in this thread yet");
  assert.equal(model.summary, model.note);
  assert.deepEqual(model.rows, []);
});

test("one artifact hides the picker and is marked open", () => {
  const model = artifactPicker(rows.slice(0, 1), null);

  assert.equal(model.shown, false);
  assert.equal(model.note, "Only one artifact in this thread");
  assert.deepEqual(model.rows.map(({ artifactId, open }) => [artifactId, open]), [["report", true]]);
  assert.equal(model.fellBack, false);
});

test("the picker keeps newest-first input order and marks only the open artifact", () => {
  const model = artifactPicker(rows, "flow");

  assert.equal(model.shown, true);
  assert.deepEqual(model.rows.map(({ artifactId, open }) => [artifactId, open]), [
    ["report", false],
    ["flow", true],
    ["sales", false],
  ]);
  assert.equal(model.fellBack, false);
  assert.equal(model.summary, "Artifact 2 of 3: תרשים, Version 3");
  assert.deepEqual(artifactPicker([rows[2], rows[0], rows[1]], "flow").rows.map(({ artifactId }) => artifactId),
    ["sales", "report", "flow"]);
});

test("an unknown open id falls back to the first row and reports the fallback", () => {
  const model = artifactPicker(rows, "removed");

  assert.equal(model.fellBack, true);
  assert.deepEqual(model.rows.filter(({ open }) => open).map(({ artifactId }) => artifactId), ["report"]);
  assert.equal(model.summary, "Artifact 1 of 3: Report, Version 2");
});

test("rows have plain labels and their own title direction", () => {
  const model = artifactPicker([
    ...rows,
    { ...rows[0], artifactId: "photo", kind: "image", title: "  " },
    { ...rows[0], artifactId: "other", kind: "constructor", title: "" },
  ], "flow");

  assert.deepEqual(model.rows.map(({ title, kindLabel, versionLabel, dir }) => [title, kindLabel, versionLabel, dir]), [
    ["Report", "HTML page", "Version 2", "ltr"],
    ["תרשים", "Diagram", "Version 3", "rtl"],
    ["Sales", "Chart", "Version 1", "ltr"],
    ["Image", "Image", "Version 2", "ltr"],
    ["Artifact", "Artifact", "Version 2", "ltr"],
  ]);
});

test("artifact body and location fields never become picker text", () => {
  const model = artifactPicker([{
    ...rows[0], title: "", body: "Example body", bodyRef: "Example reference", filePath: "Example path",
  }], "report");

  assert.deepEqual(model.rows[0], {
    artifactId: "report", title: "HTML page", kindLabel: "HTML page", versionLabel: "Version 2", dir: "ltr", open: true,
  });
  assert.equal(model.summary, "Artifact 1 of 1: HTML page, Version 2");
});

test("ArrowDown and ArrowUp move one row and stop at the ends", () => {
  assert.equal(pickerKey(rows, "report", "ArrowDown"), "flow");
  assert.equal(pickerKey(rows, "sales", "ArrowDown"), "sales");
  assert.equal(pickerKey(rows, "sales", "ArrowUp"), "flow");
  assert.equal(pickerKey(rows, "report", "ArrowUp"), "report");
});

test("Home and End jump to the first and last rows", () => {
  assert.equal(pickerKey(rows, "flow", "Home"), "report");
  assert.equal(pickerKey(rows, "flow", { key: "End", isComposing: false }), "sales");
});

test("unhandled keys and keys during text composition leave the selection alone", () => {
  for (const key of ["Tab", "ArrowLeft", "Enter"]) {
    assert.equal(pickerKey(rows, "flow", key), null);
  }
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    assert.equal(pickerKey(rows, "flow", { key, isComposing: true }), null);
  }
});

test("malformed rows and repeated ids are dropped before drawing or navigation", () => {
  const input = [
    null, false, 27, "artifact", [], {}, { artifactId: " " }, { artifactId: 1 },
    rows[0], { ...rows[0], title: "Duplicate" }, rows[1],
  ];
  const model = artifactPicker(input, "report");

  assert.deepEqual(model.rows.map(({ artifactId, title }) => [artifactId, title]), [
    ["report", "Report"], ["flow", "תרשים"],
  ]);
  assert.equal(model.moreCount, 0);
  assert.equal(pickerKey(input, "report", "ArrowDown"), "flow");
  assert.equal(pickerKey(input, "removed", "ArrowDown"), "flow");
});

test("the picker caps the list and counts only additional unique artifacts", () => {
  const artifacts = Array.from({ length: 53 }, (_, index) => ({ ...rows[0], artifactId: `artifact-${index + 1}` }));
  const input = [null, artifacts[0], ...artifacts, artifacts[51]];
  const model = artifactPicker(input, "artifact-51");

  assert.deepEqual(model.rows.map(({ artifactId }) => artifactId), artifacts.slice(0, 50).map(({ artifactId }) => artifactId));
  assert.equal(model.moreCount, 3);
  assert.equal(model.fellBack, true);
  assert.equal(model.rows[0].open, true);
  assert.equal(model.summary, "Artifact 1 of 53: Report, Version 2");
  assert.equal(pickerKey(input, "artifact-49", "End"), "artifact-50");
});

test("bad input produces an empty picker or safe label defaults", () => {
  for (const input of [undefined, null, 1, "rows", { rows }, [undefined, {}]]) {
    const model = artifactPicker(input, "report");

    assert.equal(model.shown, false);
    assert.deepEqual(model.rows, []);
    assert.equal(pickerKey(input, "report", "End"), null);
  }
  for (const key of [null, 1, {}, { key: [] }]) {
    assert.equal(pickerKey(rows, "report", key), null);
  }
  const model = artifactPicker([{ artifactId: "example", kind: Symbol(), title: {}, version: NaN }], {});

  assert.equal(model.rows[0].title, "Artifact");
  assert.equal(model.rows[0].versionLabel, "Version 1");
});
