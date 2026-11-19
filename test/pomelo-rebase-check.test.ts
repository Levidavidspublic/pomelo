import assert from "node:assert/strict";
import test from "node:test";
import { newestTag, rebaseCheck } from "../src/pomelo/rebase-check.js";

const invalidTags = ["v0.4.0-beta.1", "latest", "0.3", "0.4.0", "v0.4.0+build", "v00.4.0", "v9.0.0\n"];

test("newestTag compares major, minor and patch numbers without changing the input", () => {
  const tags = Object.freeze(["v0.9.9", "v0.10.1", "v0.10.0"]);
  assert.equal(newestTag(tags), "v0.10.1");
  assert.equal(newestTag(["v0.10.0", "v0.9.9"]), "v0.10.0");
  assert.equal(newestTag(["v0.10.1", "v1.0.0"]), "v1.0.0");
  assert.equal(newestTag(["v0.0.9007199254740992", "v0.0.9007199254740993"]), "v0.0.9007199254740993");
});

test("newestTag ignores prereleases and malformed tags", () => {
  assert.equal(newestTag([...invalidTags, "v0.3.4"]), "v0.3.4");
});

test("rebaseCheck needs no rebase when the base matches or is ahead of upstream", () => {
  for (const baseVersion of ["0.3.4", "v0.3.4", "0.3.5"]) {
    const result = rebaseCheck({ baseVersion, upstreamTags: ["v0.3.4"] });
    assert.equal(result.needed, false);
    assert.equal(result.target, "v0.3.4");
    assert.equal(result.branch, null);
  }
});

test("rebaseCheck suggests a rebase branch when upstream is newer", () => {
  const result = rebaseCheck({ baseVersion: "0.3.4", upstreamTags: ["v0.3.4", "v0.3.5"] });
  assert.equal(result.needed, true);
  assert.equal(result.target, "v0.3.5");
  assert.equal(result.branch, "rebase/friday-v0.3.5");
  assert.notEqual(result.branch, "main");
  assert.equal(result.branch.startsWith("-"), false);
});

test("rebaseCheck explains when upstream has no stable tags", () => {
  for (const upstreamTags of [[], invalidTags]) {
    assert.equal(newestTag(upstreamTags), null);
    const result = rebaseCheck({ baseVersion: "0.3.4", upstreamTags });
    assert.equal(result.needed, false);
    assert.equal(result.target, null);
    assert.equal(result.branch, null);
    assert.match(result.reason, /no stable release tags/i);
  }
});

test("rebaseCheck explains an unreadable base and still reports the newest tag", () => {
  const result = rebaseCheck({ baseVersion: "0.3", upstreamTags: ["v0.3.5"] });
  assert.equal(result.needed, false);
  assert.equal(result.target, "v0.3.5");
  assert.equal(result.branch, null);
  assert.match(result.reason, /base version/i);
});
