import assert from "node:assert/strict";
import test from "node:test";
import { tableView } from "../src/client/pomelo/reply-table.js";

const header = ["Name", "Price", "Date"];
const rows = Array.from({ length: 40 }, (_, i) => [`Item ${i + 1}`, "12.50", "2026-11-20"]);

test("an English table uses ltr and ordinary text uses auto", () => {
  const view = tableView({ header, rows: [["Pear", "12", "2026-11-20"]], messageDir: "ltr" });
  assert.ok(view);
  assert.equal(view.dir, "ltr");
  assert.deepEqual(view.header[0], { text: "Name", cellDir: "auto" });
  assert.deepEqual(view.visibleRows[0]?.[0], { text: "Pear", cellDir: "auto" });
});

test("an RTL table keeps standalone numbers, dates, paths and code in ltr", () => {
  const values = [
    "שלום עולם", "−1,234.50", "١٢٣", "2026-11-20", "20/11/2026",
    "src/שלום.ts", "C:\\docs\\שלום.txt", "`run('שלום')`", "~~~js\n// שלום\n~~~",
    "גרסה 2", "שלום `code`", "`one` and `two`",
  ];
  const view = tableView({ header: ["2026"], rows: [values], messageDir: "rtl" });
  assert.ok(view);
  assert.equal(view.dir, "rtl");
  assert.equal(view.header[0]?.cellDir, "ltr");
  assert.deepEqual(view.visibleRows[0]?.map(({ cellDir }) => cellDir), [
    "auto", "ltr", "ltr", "ltr", "ltr", "ltr", "ltr", "ltr", "ltr", "auto", "auto", "auto",
  ]);
  assert.deepEqual(view.visibleRows[0]?.map(({ text }) => text), values);
});

test("a folded table exposes the first 12 rows and a label with the full row count", () => {
  const view = tableView({ header, rows, messageDir: "ltr", expanded: false });
  assert.ok(view);
  assert.deepEqual(view.visibleRows.map((row) => row.map(({ text }) => text)), rows.slice(0, 12));
  assert.equal(view.hiddenCount, 28);
  assert.equal(view.showAllLabel, "Show all 40 rows");
});

test("expansion exposes every row and clears the show-all label", () => {
  const view = tableView({ header, rows, messageDir: "ltr", expanded: true });
  assert.ok(view);
  assert.deepEqual(view.visibleRows.map((row) => row.map(({ text }) => text)), rows);
  assert.equal(view.hiddenCount, 0);
  assert.equal(view.showAllLabel, "");
});

test("twelve rows and four columns fit at the limits", () => {
  const view = tableView({
    header: [...header, "Note"],
    rows: rows.slice(0, 12),
    messageDir: "auto",
  });
  assert.ok(view);
  assert.equal(view.dir, "ltr");
  assert.equal(view.visibleRows.length, 12);
  assert.equal(view.hiddenCount, 0);
  assert.equal(view.showAllLabel, "");
  assert.equal(view.scrollsSideways, false);
});

test("five columns scroll sideways", () => {
  const view = tableView({ header: ["A", "B", "C", "D", "E"], rows: [], messageDir: "ltr" });
  assert.equal(view?.scrollsSideways, true);
});

test("a long header or body cell sets the scroll flag, including in folded rows", () => {
  const atLimit = "שָׁ".repeat(40);
  const overLimit = `${atLimit}שָׁ`;
  const fit = tableView({ header: [atLimit], rows: [], messageDir: "rtl" });
  assert.equal(fit?.scrollsSideways, false);
  const longHeader = tableView({ header: [overLimit], rows: [], messageDir: "rtl" });
  assert.equal(longHeader?.scrollsSideways, true);
  const longBody = tableView({ header, rows: [...rows, [overLimit]], messageDir: "rtl" });
  assert.equal(longBody?.visibleRows.length, 12);
  assert.equal(longBody.scrollsSideways, true);
});

test("ragged rows and a short header are padded without changing the input", () => {
  const short = Object.freeze(["Pear"]);
  const wide = Object.freeze(["Plum", "10", "2026-11-20"]);
  const view = tableView({
    header: Object.freeze(["Name", "Price"]),
    rows: Object.freeze([short, wide]),
    messageDir: "ltr",
  });
  assert.ok(view);
  assert.deepEqual(view.header.map(({ text }) => text), ["Name", "Price", ""]);
  assert.deepEqual(view.visibleRows[0], [
    { text: "Pear", cellDir: "auto" },
    { text: "", cellDir: "auto" },
    { text: "", cellDir: "auto" },
  ]);
  assert.deepEqual(view.visibleRows[1]?.map(({ text }) => text), wide);
});

test("a table with no cells returns null", () => {
  assert.equal(tableView({ header: [], rows: [], messageDir: "ltr" }), null);
  assert.equal(tableView({ header: [], rows: [[]], messageDir: "rtl" }), null);
});

test("the summary names the columns and row count on one line using only header text", () => {
  const view = tableView({ header, rows, messageDir: "ltr" });
  assert.equal(view?.summary, "Table, 3 columns, 40 rows: Name, Price, Date");
  const multiline = tableView({ header: ["Item\r\nname"], rows: [["Pear"]], messageDir: "ltr" });
  assert.equal(multiline?.summary, "Table, 1 column, 1 row: Item name");
});
