import assert from "node:assert/strict";
import test from "node:test";
import { doneLineCheck, parseDoneLine, readRunSummary } from "../src/pomelo/done-line.js";

const testPath = "test/pomelo-example.test.ts";
const doneLine = `npm test -- ${testPath} -> all tests pass`;
const npmHeader = `> node scripts/test.mjs ${testPath}`;
const tapCounts = ["# tests 1", "# pass 1", "# fail 0"].join("\n");
const tapOutput = [
  "TAP version 13",
  `# Subtest: ${testPath}`,
  `ok 1 - ${testPath}`,
  "1..1",
  tapCounts,
].join("\n");

test("a clean TAP run of the named file passes", () => {
  const summary = readRunSummary(tapOutput);
  assert.equal(summary.tests, 1);
  assert.equal(summary.pass, 1);
  assert.equal(summary.fail, 0);
  assert.deepEqual(summary.testFiles, [testPath]);
  assert.deepEqual(doneLineCheck({ doneLine, exitCode: 0, output: tapOutput }), {
    verdict: "pass",
    reasons: [],
  });
});

test("the spec reporter handles ANSI colours and Windows line endings and paths", () => {
  const output = [
    "\x1b[32m✔ test\\pomelo-example.test.ts (15.2ms)\x1b[39m",
    "\x1b[34mℹ tests 1\x1b[39m",
    "ℹ pass 1",
    "ℹ fail 0",
  ].join("\r\n");

  assert.equal(doneLineCheck({ doneLine, exitCode: 0, output }).verdict, "pass");
});

test("the runner header identifies the file when TAP only prints test titles", () => {
  const output = [npmHeader, "TAP version 13", "ok 1 - example assertion", "1..1", tapCounts].join("\n");
  assert.equal(doneLineCheck({ doneLine, exitCode: 0, output }).verdict, "pass");
});

test("a nonzero exit code fails even with a clean test summary", () => {
  const result = doneLineCheck({ doneLine, exitCode: 1, output: tapOutput });
  assert.equal(result.verdict, "fail");
  assert.match(result.reasons.join(" "), /exit code 1/i);
});

test("zero tests or a summary containing only skipped tests is not-run", () => {
  for (const output of [
    [npmHeader, "1..0", "# tests 0", "# pass 0", "# fail 0"].join("\n"),
    [npmHeader, "ok 1 - example assertion # SKIP", "# tests 1", "# pass 0", "# fail 0", "# skipped 1"].join("\n"),
  ]) {
    const result = doneLineCheck({ doneLine, exitCode: 0, output });
    assert.equal(result.verdict, "not-run");
    assert.match(result.reasons.join(" "), /no tests ran/i);
  }
});

test("a clean count without the named file is not-run", () => {
  const output = ["TAP version 13", "ok 1 - example assertion", "1..1", tapCounts].join("\n");
  const result = doneLineCheck({ doneLine, exitCode: 0, output });
  assert.equal(result.verdict, "not-run");
  assert.ok(result.reasons.some((reason) => reason.includes(testPath)));
});

test("Node's missing-file diagnostic is not-run even when Node exits with code 1", () => {
  const output = `${npmHeader}\nCould not find '${testPath}'`;
  const result = doneLineCheck({ doneLine, exitCode: 1, output });
  assert.equal(result.verdict, "not-run");
  assert.match(result.reasons.join(" "), /could not find the requested test file/i);
});

test("a different test file in the results makes the run not-run", () => {
  for (const output of [
    `ok 1 - test/other.test.ts\n${tapCounts}`,
    `${npmHeader}\nok 1 - test/other.test.ts\n${tapCounts}`,
    `ok 1 - ${testPath}\nok 2 - test/other.test.ts\n# tests 2\n# pass 2\n# fail 0`,
  ]) {
    const result = doneLineCheck({ doneLine, exitCode: 0, output });
    assert.equal(result.verdict, "not-run");
    assert.match(result.reasons.join(" "), /different test file/i);
  }
});

test("a failed test fails with a lost exit code or a later clean summary", () => {
  const output = [
    `not ok 1 - ${testPath}`,
    "# tests 1",
    "# pass 0",
    "# fail 1",
  ].join("\n");

  for (const capture of [output, `${output}\n${tapOutput}`]) {
    const result = doneLineCheck({ doneLine, exitCode: null, output: capture });
    assert.equal(result.verdict, "fail");
    assert.match(result.reasons.join(" "), /1 test failed/i);
  }
});

test("a visible failure fails even if the summary is cut off", () => {
  for (const output of ["not ok 1 - example assertion", "✖ example assertion (1.2ms)"]) {
    const result = doneLineCheck({ doneLine, output: `${npmHeader}\n${output}` });
    assert.equal(result.verdict, "fail");
    assert.match(result.reasons.join(" "), /test failed/i);
  }
});

test("a TAP TODO result does not count as a failure", () => {
  const output = [npmHeader, "not ok 1 - unfinished assertion # TODO", "ok 2 - passing assertion", "# tests 2", "# pass 1", "# fail 0"].join("\n");
  assert.equal(doneLineCheck({ doneLine, exitCode: 0, output }).verdict, "pass");
});

test("a truncated summary or a missing exit code cannot pass", () => {
  assert.equal(doneLineCheck({ doneLine, exitCode: 0, output: `${npmHeader}\n# tests 1\n# pass 1` }).verdict, "not-run");
  assert.equal(doneLineCheck({ doneLine, output: tapOutput }).verdict, "not-run");
});

test("a DONE line with two test commands is refused", () => {
  for (const invalid of [
    `${doneLine} && npm test -- test/other.test.ts`,
    `npm test -- ${testPath} && npm test -- test/other.test.ts -> all tests pass`,
  ]) {
    const result = doneLineCheck({ doneLine: invalid, exitCode: 0, output: tapOutput });
    assert.equal(result.verdict, "fail");
    assert.match(result.reasons.join(" "), /one npm test/i);
  }
});

test("both ticket forms report that typecheck is required", () => {
  for (const withTypecheck of [
    `\`npm test -- ${testPath} && npm run typecheck\` -> all tests pass`,
    `\`npm test -- ${testPath}\` -> all tests pass && npm run typecheck`,
  ]) {
    assert.deepEqual(parseDoneLine(withTypecheck), { testPath, expected: "all tests pass", requiresTypecheck: true });
    const result = doneLineCheck({ doneLine: withTypecheck, exitCode: 0, output: tapOutput });
    assert.equal(result.verdict, "pass");
    assert.match(result.reasons.join(" "), /typecheck is required/i);
  }

  assert.deepEqual(parseDoneLine(doneLine), { testPath, expected: "all tests pass", requiresTypecheck: false });
});
