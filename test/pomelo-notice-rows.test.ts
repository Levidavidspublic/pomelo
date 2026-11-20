import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkNoticeRows } from "../src/pomelo/notice-rows.js";

const friday = "## Friday (MIT)\n\n[Friday upstream](https://github.com/splashxmoon/friday)";
const tableHeader = "| Package | Licence | Source |\n| --- | --- | --- |";

test("accepts the repository's third-party notices", () => {
  const notices = readFileSync(new URL("../THIRD-PARTY-NOTICES.md", import.meta.url), "utf8");
  assert.deepEqual(checkNoticeRows(notices), { ok: true, problems: [] });
});

test("reports missing heading fields in line order", () => {
  const text = [
    friday,
    "",
    "## Example",
    "[Upstream](https://example.org/example)",
    "",
    "## Local Only (BSD-3-Clause)",
    "See the [licence](LICENSE).",
    "",
    "## (Apache-2.0)",
    "[Upstream](https://example.org/unnamed)",
  ].join("\n");

  assert.deepEqual(checkNoticeRows(text), {
    ok: false,
    problems: [
      { line: 5, package: "Example", reason: "no-licence" },
      { line: 8, package: "Local Only", reason: "no-source" },
      { line: 11, reason: "no-name" },
    ],
  });
});

test("accepts Markdown tables with reordered columns and Windows line endings", () => {
  const text = [
    "# Third-party notices",
    "",
    "Source | Package | License | Notes",
    ":--- | --- | :---: | ---:",
    "[Upstream](https://github.com/splashxmoon/friday) | Friday | MIT | מבוסס על Friday",
    "https://example.org/other | Other | BSD-3-Clause | Example \\| note",
  ].join("\r\n");

  assert.deepEqual(checkNoticeRows(text), { ok: true, problems: [] });
});

test("reports missing table cells, including omitted trailing cells", () => {
  const text = [
    friday,
    "",
    tableHeader,
    "| | BSD-3-Clause | https://example.org/unnamed |",
    "| Example | | https://example.org/example |",
    "| Short Row | Apache-2.0 |",
    "| | | |",
  ].join("\r\n");

  assert.deepEqual(checkNoticeRows(text), {
    ok: false,
    problems: [
      { line: 7, reason: "no-name" },
      { line: 8, package: "Example", reason: "no-licence" },
      { line: 9, package: "Short Row", reason: "no-source" },
      { line: 10, reason: "no-name" },
      { line: 10, reason: "no-licence" },
      { line: 10, reason: "no-source" },
    ],
  });
});

test("reports a missing source when the source column is removed", () => {
  const text = [
    "| Package | Licence |",
    "| --- | --- |",
    "| Friday | MIT |",
  ].join("\n");

  assert.deepEqual(checkNoticeRows(text), {
    ok: false,
    problems: [{ line: 3, package: "Friday", reason: "no-source" }],
  });
});

test("reports later occurrences across layouts despite case and spacing differences", () => {
  const text = [
    friday,
    "",
    "## Example Package  (Apache-2.0)",
    "[Upstream](https://example.org/example)",
    "",
    tableHeader,
    "|  eXAMPLE   PACKAGE  | Apache-2.0 | https://example.org/example |",
    "|  FRIDAY  | MIT | https://github.com/splashxmoon/friday |",
  ].join("\n");

  assert.deepEqual(checkNoticeRows(text), {
    ok: false,
    problems: [
      { line: 10, package: "eXAMPLE   PACKAGE", reason: "listed-twice" },
      { line: 11, package: "FRIDAY", reason: "listed-twice" },
    ],
  });
});

test("reports an empty or whitespace-only file", () => {
  for (const text of ["", " \r\n\t "]) {
    assert.deepEqual(checkNoticeRows(text), {
      ok: false,
      problems: [{ line: 1, reason: "empty-file" }],
    });
  }
});

test("requires an actual Friday MIT entry", () => {
  for (const text of [
    "## Other (MIT)\nBased on Friday.\n[Upstream](https://example.org/other)",
    friday.replace("(MIT)", "(Apache-2.0)"),
    ["```markdown", friday, "```"].join("\n"),
    ["<!--", friday, "-->"].join("\n"),
  ]) {
    assert.deepEqual(checkNoticeRows(text), {
      ok: false,
      problems: [{ line: 1, reason: "friday-missing" }],
    });
  }
});

test("allows a Hebrew note in a heading block before its source", () => {
  const text = [
    "# Third-party notices",
    "",
    "## Friday (MIT)",
    "",
    "הערה בעברית על רישיון החבילה.",
    "[Friday upstream](https://github.com/splashxmoon/friday)",
  ].join("\r\n");

  assert.deepEqual(checkNoticeRows(text), { ok: true, problems: [] });
});
