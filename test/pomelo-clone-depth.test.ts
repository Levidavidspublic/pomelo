import assert from "node:assert/strict";
import test from "node:test";
import { checkCloneDepth } from "../src/pomelo/clone-depth.js";

const complete = {
  shallowText: "false",
  tagText: "a1".repeat(20),
  mergeBaseText: "b2".repeat(20),
};

test("checkCloneDepth gives go for a full clone with the tag and merge-base", () => {
  const result = checkCloneDepth(complete);
  assert.equal(result.verdict, "go");
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.nextStep, null);
  assert.ok(result.reason);
});

test("checkCloneDepth names each missing history requirement in order", () => {
  const cases = [
    [{ ...complete, shallowText: "true" }, ["shallow clone"]],
    [{ ...complete, tagText: "" }, ["v0.3.4 tag"]],
    [{ ...complete, mergeBaseText: "" }, ["merge-base with upstream"]],
    [{ shallowText: "true", tagText: "", mergeBaseText: "" }, ["shallow clone", "v0.3.4 tag", "merge-base with upstream"]],
  ] as const;

  for (const [input, missing] of cases) {
    const result = checkCloneDepth(input);
    assert.equal(result.verdict, "deepen");
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, missing);
    assert.ok(result.nextStep);
    assert.match(result.nextStep, /fetch full history and tags/i);
    assert.doesNotMatch(result.nextStep, /:\/\/|\b\S+@\S+/);
    assert.match(result.nextStep, input.shallowText === "true"
      ? /git fetch --unshallow --tags upstream\b/
      : /git fetch --tags upstream\b/);
    for (const item of missing) assert.ok(result.reason.includes(item));
  }
});

test("checkCloneDepth accepts one LF or CRLF and full 64-character commit IDs", () => {
  for (const ending of ["\n", "\r\n"]) {
    const result = checkCloneDepth({
      shallowText: `false${ending}`,
      tagText: `${"A1".repeat(32)}${ending}`,
      mergeBaseText: `${"b2".repeat(32)}${ending}`,
    });
    assert.equal(result.verdict, "go");
    assert.deepEqual(result.missing, []);
    assert.deepEqual(checkCloneDepth({ ...complete, tagText: ending }).missing, ["v0.3.4 tag"]);
  }
});

test("checkCloneDepth stops on malformed Git output even when history is missing", () => {
  const cases = [
    { ...complete, shallowText: "maybe" },
    { ...complete, shallowText: "" },
    { ...complete, shallowText: "false\ntrue" },
    { ...complete, shallowText: "false\n\n" },
    { ...complete, tagText: `${complete.tagText}\r\n\r\n` },
    { ...complete, tagText: "abc123" },
    { ...complete, tagText: "g".repeat(40) },
    { ...complete, mergeBaseText: ` ${complete.mergeBaseText}` },
    { ...complete, mergeBaseText: 123 },
    { ...complete, tagText: undefined },
    { shallowText: "true", tagText: "", mergeBaseText: "abc123" },
  ];

  for (const input of cases) {
    const result = checkCloneDepth(input);
    assert.equal(result.verdict, "stop", JSON.stringify(input));
    assert.equal(result.ok, false);
    assert.equal(result.nextStep, null);
    assert.ok(result.reason);
  }
});
