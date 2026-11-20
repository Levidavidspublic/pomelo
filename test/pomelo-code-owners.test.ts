import assert from "node:assert/strict";
import test from "node:test";
import { checkCodeOwners } from "../src/pomelo/code-owners.js";

const owner = "@owner-example";
const protectedPaths = [
  ".github/workflows/ci.yml",
  "docs/harness/01-PRD.md",
  "docs/harness/02-TRD.md",
  "docs/harness/03-APP-FLOW.md",
  "docs/harness/04-UI-BRIEF.md",
  "docs/harness/05-BACKEND-SCHEMA.md",
  "docs/harness/06-ROADMAP.md",
  "AGENTS.md",
  "POMELO.md",
  "PAUSE_AUTOMERGE",
];

test("accepts the required owner on every protected path", () => {
  const text = [
    `/.github/** ${owner}`,
    `docs/harness/*.md ${owner}`,
    `/AGENTS.md ${owner}`,
    `/POMELO.md ${owner} @another-example`,
    `PAUSE_AUTOMERGE ${owner}`,
  ].join("\n");

  assert.deepEqual(checkCodeOwners(text, protectedPaths, owner), { ok: true, findings: [] });
});

test("names a path with no matching line", () => {
  const result = checkCodeOwners(`AGENTS.md ${owner}`, ["AGENTS.md", "POMELO.md"], owner);

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "POMELO.md");
  assert.equal(result.findings[0].line, null);
  assert.match(result.findings[0].reason, /no matching/i);
});

test("uses the last matching line even when an earlier line is more specific", () => {
  const text = `/AGENTS.md ${owner}\nPOMELO.md ${owner}\n* @another-example\n/POMELO.md ${owner}`;
  const result = checkCodeOwners(text, ["AGENTS.md", "POMELO.md"], owner);

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "AGENTS.md");
  assert.equal(result.findings[0].line, 3);
  assert.match(result.findings[0].reason, /required owner/i);
});

test("reports an ownerless override only for the protected path it applies to", () => {
  const text = `* ${owner}\n/AGENTS.md # intentionally unowned\n/notes.md`;
  const result = checkCodeOwners(text, ["AGENTS.md", "POMELO.md"], owner);

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "AGENTS.md");
  assert.equal(result.findings[0].line, 2);
  assert.match(result.findings[0].reason, /ownership removed/i);
});

test("a root-anchored directory covers descendants only at the root", () => {
  const paths = [".github/workflows/ci.yml", "nested/.github/workflows/ci.yml", "xgithub/workflows/ci.yml"];
  const result = checkCodeOwners(`/.github/ ${owner}`, paths, owner);

  assert.deepEqual(result.findings.map(({ path }) => path), paths.slice(1));
});

test("later literal directory rules override or remove ownership without a trailing slash", () => {
  const text = [
    `/.github/ ${owner}`,
    `/.github/workflows @another-example`,
    `/docs/ ${owner}`,
    "/docs/harness",
  ].join("\n");
  const paths = [".github/workflows/ci.yml", "docs/harness/sub/x.md", ".github/workflows-extra/ci.yml"];
  const result = checkCodeOwners(text, paths, owner);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path, line }) => ({ path, line })), [
    { path: paths[0], line: 2 },
    { path: paths[1], line: 4 },
  ]);
  assert.match(result.findings[0].reason, /required owner/i);
  assert.match(result.findings[1].reason, /ownership removed/i);
});

test("later wildcard directory rules override or remove ownership without a trailing slash", () => {
  const text = [
    `* ${owner}`,
    "/.git* @another-example",
    "docs/harn*",
  ].join("\n");
  const paths = [
    ".github/workflows/ci.yml",
    "docs/harness/sub/x.md",
    "nested/.github/workflows/ci.yml",
    "docs/other/harness/x.md",
  ];
  const result = checkCodeOwners(text, paths, owner);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path, line }) => ({ path, line })), [
    { path: paths[0], line: 2 },
    { path: paths[1], line: 3 },
  ]);
  assert.match(result.findings[0].reason, /required owner/i);
  assert.match(result.findings[1].reason, /ownership removed/i);
});

test("rejects a protected glob even when a broad rule has the required owner", () => {
  const text = `/.github/** ${owner}\n/.github/workflows @another-example`;
  const result = checkCodeOwners(text, [".github/**"], owner);

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, ".github/**");
  assert.equal(result.findings[0].line, null);
  assert.match(result.findings[0].reason, /concrete file path/i);
});

test("a rule ending in a single star covers only one level", () => {
  const paths = ["docs/intro.md", "docs/harness/x.md"];
  const result = checkCodeOwners(`docs/* ${owner}`, paths, owner);

  assert.deepEqual(result.findings.map(({ path }) => path), [paths[1]]);
});

test("a single star stays within one path part and dots are literal", () => {
  const paths = ["docs/harness/01-PRD.md", "docs/harness/sub/x.md", "docs/harness/xmd", "nested/docs/harness/x.md"];
  const result = checkCodeOwners(`docs/harness/*.md ${owner}`, paths, owner);

  assert.deepEqual(result.findings.map(({ path }) => path), paths.slice(1));
});

test("a double-star path part crosses zero or more directories", () => {
  const paths = ["docs/01-PRD.md", "docs/harness/01-PRD.md", "docs/harness/sub/x.md", "docs/harness/note.txt"];
  const result = checkCodeOwners(`docs/**/*.md ${owner}`, paths, owner);

  assert.deepEqual(result.findings.map(({ path }) => path), ["docs/harness/note.txt"]);
});

test("handles comments, blank lines, tabs and CRLF while retaining line numbers", () => {
  const text = ["  # rule notes", "", `*\t${owner}`, "  /AGENTS.md\t@another-example  # override"].join("\r\n");
  const result = checkCodeOwners(text, ["AGENTS.md", "POMELO.md"], owner);

  assert.deepEqual(result.findings.map(({ path, line }) => ({ path, line })), [{ path: "AGENTS.md", line: 4 }]);
});

test("compares complete owner handles without regard to case and requires the at sign", () => {
  const text = `AGENTS.md @OWNER-EXAMPLE\nPOMELO.md @owner-example-extra`;

  assert.equal(checkCodeOwners(text, ["AGENTS.md"], owner).ok, true);
  assert.equal(checkCodeOwners(text, ["AGENTS.md"], "owner-example").ok, false);
  assert.equal(checkCodeOwners(text, ["POMELO.md"], owner).ok, false);
  assert.equal(checkCodeOwners("AGENTS.md owner-example", ["AGENTS.md"], owner).ok, false);
});

test("reports unreadable lines and still checks valid rules", () => {
  const text = [`!AGENTS.md ${owner}`, "POMELO.md owner-example", `* ${owner}`].join("\n");
  const result = checkCodeOwners(text, ["AGENTS.md", "POMELO.md"], owner);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path, line }) => ({ path, line })), [
    { path: "CODEOWNERS", line: 1 },
    { path: "CODEOWNERS", line: 2 },
  ]);
});

test("empty text names every protected path with no line number", () => {
  const result = checkCodeOwners("", protectedPaths, owner);

  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map(({ path, line }) => ({ path, line })), protectedPaths.map((path) => ({ path, line: null })));
});
