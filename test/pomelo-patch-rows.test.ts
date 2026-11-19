import assert from "node:assert/strict";
import test from "node:test";
import { checkPatchRows } from "../src/pomelo/patch-rows.js";

const header = [
  "| File | Hook | Reason | Ticket |",
  "| --- | --- | --- | --- |",
];
const goodRow = "| `src/app.ts` | Extend session rows | Show project tags | #123 |";

function ledger(...rows: string[]): string {
  return [...header, ...rows].join("\n");
}

test("reads the ledger's file, reason, and ticket columns", () => {
  assert.deepEqual(checkPatchRows(ledger(goodRow)), {
    ok: true,
    rows: [{ line: 3, file: "src/app.ts", reason: "Show project tags", ticket: "#123" }],
    findings: [],
  });
});

test("finds reordered columns by name and accepts a phase ticket", () => {
  const markdown = [
    "Ticket | Why | File",
    ":--- | :---: | ---:",
    "P1-17 | Show project tags \\| latest activity | src/app.ts",
  ].join("\n");

  assert.deepEqual(checkPatchRows(markdown), {
    ok: true,
    rows: [{ line: 3, file: "src/app.ts", reason: "Show project tags | latest activity", ticket: "P1-17" }],
    findings: [],
  });
});

test("reports an empty file cell on its source line", () => {
  const result = checkPatchRows(ledger("|   | Hook | Reason | #123 |"));

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, [{ line: 3, problem: "Missing file path." }]);
});

test("requires plain repo-relative paths into Friday files", () => {
  const paths = [
    "/src/app.ts",
    "C:\\src\\app.ts",
    "src/../app.ts",
    "src\\..\\app.ts",
    "src/pomelo/check.ts",
    "src\\client\\pomelo\\panel.tsx",
    "[app](src/app.ts)",
  ];

  for (const path of paths) {
    const result = checkPatchRows(ledger(`| \`${path}\` | Hook | Reason | #123 |`));
    assert.equal(result.ok, false, path);
    assert.deepEqual(result.findings, [{ line: 3, problem: "Expected a plain repo-relative Friday file path." }], path);
  }
});

test("reports an empty reason even when the hook has text", () => {
  const result = checkPatchRows(ledger("| src/app.ts | Hook |   | #123 |"));

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, [{ line: 3, problem: "Missing reason." }]);
});

test("requires a ticket reference in the ticket column", () => {
  for (const ticket of ["", "123", "pending", "XP1-17", "#123abc"]) {
    const result = checkPatchRows(ledger(`| src/app.ts | Hook #123 | Reason P1-17 | ${ticket} |`));
    assert.equal(result.ok, false, ticket);
    assert.deepEqual(result.findings, [{ line: 3, problem: "Missing ticket reference." }], ticket);
  }
});

test("reports each repeated file and the line of its first entry", () => {
  const result = checkPatchRows(ledger(goodRow, "| src\\app.ts | Another hook | Reason | P1-17 |"));

  assert.equal(result.ok, false);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.findings, [{ line: 4, problem: "Duplicate file src/app.ts (first listed on line 3)." }]);
});

test("reports all omissions in a row", () => {
  assert.deepEqual(checkPatchRows(ledger("| | Hook | | |")).findings, [
    { line: 3, problem: "Missing file path." },
    { line: 3, problem: "Missing reason." },
    { line: 3, problem: "Missing ticket reference." },
  ]);
});

test("accepts an empty table without counting its header or divider", () => {
  assert.deepEqual(checkPatchRows(ledger()), { ok: true, rows: [], findings: [] });
});

test("uses source line numbers with Windows line endings and surrounding text", () => {
  const markdown = [
    "# Patch ledger",
    "| Illustrative text | outside the table |",
    "",
    ...header,
    "| src/app.ts | Hook | | #123 |",
    "",
    "| A pipe-separated note | outside the table |",
  ].join("\r\n");

  const result = checkPatchRows(markdown);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.findings, [{ line: 6, problem: "Missing reason." }]);
});

test("ignores pipe-delimited text, unrelated tables, and fenced examples", () => {
  const markdown = [
    "This page has no patch table.",
    "| src/app.ts | Hook | Reason | #123 |",
    "",
    "| Example | Details |",
    "| --- | --- |",
    "| Something | Some details |",
    "",
    "```markdown",
    ledger(goodRow),
    "```",
  ].join("\n");

  assert.deepEqual(checkPatchRows(markdown), { ok: true, rows: [], findings: [] });
});
