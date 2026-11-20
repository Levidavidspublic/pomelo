import assert from "node:assert/strict";
import { test } from "node:test";
import { skipCiCommits } from "../src/pomelo/skip-ci.js";

for (const marker of ["[skip ci]", "[ci skip]", "[no ci]", "[skip actions]", "[actions skip]"]) {
  test(`find ${marker} in a commit subject`, () => {
    assert.deepEqual(skipCiCommits([{ sha: "a", message: `Update docs ${marker}` }]), [
      { sha: "a", marker },
    ]);
  });

  const variant = marker.toUpperCase().replace(" ", "-");
  test(`find ${variant} and report its original spelling`, () => {
    assert.deepEqual(skipCiCommits([{ sha: "a", message: variant }]), [
      { sha: "a", marker: variant },
    ]);
  });
}

for (const marker of ["skip-checks: true", "skip-checks:true", "SKIP-CHECKS: TRUE"]) {
  test(`find the ${marker} trailer at the end of a message`, () => {
    const message = `Update docs\r\n\r\n\r\nReviewed-by: Reviewer\r\n${marker}\r\n`;
    assert.deepEqual(skipCiCommits([{ sha: "a", message }]), [{ sha: "a", marker }]);
  });
}

test("find markers in the body and report each matching commit once in input order", () => {
  assert.deepEqual(skipCiCommits([
    { sha: "third", message: "Update docs\n\nMaintenance only [ci skip] [no ci]" },
    { sha: "second", message: "Update tests" },
    { sha: "first", message: "Update examples [skip actions]" },
  ]), [
    { sha: "third", marker: "[ci skip]" },
    { sha: "first", marker: "[skip actions]" },
  ]);
});

test("ignore clean, empty, and unusual messages without a skip marker", () => {
  const messages = [
    "Update docs",
    "",
    "\r\n\t",
    "Explain skipping ci docs",
    "Explain [skipping ci] and [skip ci docs]",
    "Document skip-checks: true",
    "Update docs\n\nskip-checks: true is a trailer example",
    "Update docs\n\nskip-checks: false",
  ];
  assert.deepEqual(skipCiCommits(messages.map((message) => ({ sha: "a", message }))), []);
});

test("return no matches for an empty commit list", () => {
  assert.deepEqual(skipCiCommits([]), []);
});
