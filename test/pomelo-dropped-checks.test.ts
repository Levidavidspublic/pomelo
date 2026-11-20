import assert from "node:assert/strict";
import { test } from "node:test";
import { findDroppedChecks } from "../src/pomelo/dropped-checks.js";

function lines(first: number, ...source: string[]) {
  return source.map((text, offset) => ({ line: first + offset, text }));
}

test("reports a dropped Pomelo assertion with its original line number", () => {
  const path = "test/pomelo-example.test.ts";
  assert.deepEqual(findDroppedChecks([{
    path,
    removedLines: lines(12, "  assert.ok(actual);"),
    addedLines: [],
  }]), {
    ok: false,
    hits: [{ path, removed: 1, added: 0, removedLines: [12], removedTests: [] }],
  });
});

test("accepts swapping one assertion line for another", () => {
  assert.deepEqual(findDroppedChecks([{
    path: "test/pomelo-example.test.ts",
    removedLines: lines(12, "  assert.ok(actual);"),
    addedLines: lines(15, "  expect(actual).toBe(expected);"),
  }]), { ok: true, hits: [] });
});

test("names a whole removed test even when another assertion replaces its count", () => {
  const path = "test/guardrails.test.ts";
  assert.deepEqual(findDroppedChecks([{
    path,
    removedLines: lines(20,
      "it(",
      '  "checks nested values",',
      "  async () => {",
      "    assert.deepEqual(getValue({ nested: true }), expected);",
      "  },",
      ");",
    ),
    addedLines: lines(30, "  assert.match(actual, expected);"),
  }]), {
    ok: false,
    hits: [{ path, removed: 1, added: 1, removedLines: [23], removedTests: ["checks nested values"] }],
  });
});

test("accepts a test file that only gains assertions", () => {
  assert.deepEqual(findDroppedChecks([{
    path: "test/untrusted.test.ts",
    removedLines: [],
    addedLines: lines(18, "  assert.equal(actual, expected);", "  assert.ok(actual);"),
  }]), { ok: true, hits: [] });
});

test("ignores assertion text in comments, strings, and regex literals", () => {
  assert.deepEqual(findDroppedChecks([{
    path: "test/pomelo-comments.test.ts",
    removedLines: lines(6,
      "  // assert.ok(actual);",
      "  /*",
      "  expect(actual).rejects;",
      "  */",
      '  const example = "assert(actual).throws";',
      "  const examplePattern = /expect[(]/;",
      "  const matcherPattern = /.throws/;",
    ),
    addedLines: [],
  }]), { ok: true, hits: [] });
});

test("ignores non-test files", () => {
  assert.deepEqual(findDroppedChecks([
    { path: "src/pomelo/example.ts", removedLines: lines(8, "assert.ok(actual);"), addedLines: [] },
    { path: "test/helper.ts", removedLines: lines(8, "assert.ok(actual);"), addedLines: [] },
  ]), { ok: true, hits: [] });
});

test("reports a deleted Friday test file with every removed assertion line and test name", () => {
  const path = "test/untrusted.test.ts";
  assert.deepEqual(findDroppedChecks([{
    path,
    removedLines: lines(1,
      'import assert from "node:assert/strict";',
      'test("direct and strict", () => {',
      "  assert(actual); assert.strict.equal(actual, expected);",
      "});",
      'test("synchronous and asynchronous errors", async () => {',
      "  assert.throws(run, /[(]/);",
      "  await assert.rejects(runAsync);",
      "});",
    ),
    addedLines: [],
  }]), {
    ok: false,
    hits: [{
      path, removed: 3, added: 0, removedLines: [3, 6, 7],
      removedTests: ["direct and strict", "synchronous and asynchronous errors"],
    }],
  });
});

test("counts matcher lines and keeps assertion totals separate for each file", () => {
  const path = "test/pomelo-matchers.test.ts";
  const fridayPath = "test/untrusted.test.ts";
  assert.deepEqual(findDroppedChecks([
    {
      path,
      removedLines: lines(10,
        "  await expect(runAsync())",
        "    .rejects.toThrow(expected);",
        "  await check(run).throws;",
      ),
      addedLines: lines(15, "  await assert.rejects(runAsync);"),
    },
    {
      path: "test/guardrails.test.ts",
      removedLines: [],
      addedLines: lines(5, "  assert.ok(actual);", "  expect(actual).toBe(expected);"),
    },
    {
      path: fridayPath,
      removedLines: lines(5, "  assert.match(actual, expected);"),
      addedLines: [],
    },
  ]), {
    ok: false,
    hits: [
      { path, removed: 3, added: 1, removedLines: [10, 11, 12], removedTests: [] },
      { path: fridayPath, removed: 1, added: 0, removedLines: [5], removedTests: [] },
    ],
  });
});

test("does not treat a partial test edit as a whole removed block", () => {
  const path = "test/pomelo-example.test.ts";
  assert.deepEqual(findDroppedChecks([{
    path,
    removedLines: [
      ...lines(1, 'test("old title", () => {', "  assert.ok(actual);"),
      ...lines(4, "});"),
    ],
    addedLines: lines(1, 'test("new title", () => {'),
  }]), {
    ok: false,
    hits: [{ path, removed: 1, added: 0, removedLines: [2], removedTests: [] }],
  });
});

test("accepts a test moved with the same assertion count", () => {
  assert.deepEqual(findDroppedChecks([{
    path: "test/pomelo-moved.test.ts",
    removedLines: lines(9, 'test("checks a value", () => {', "  assert.ok(actual);", "});"),
    addedLines: lines(25, "test('checks a value', () => {", "  assert.equal(actual, expected);", "});"),
  }]), { ok: true, hits: [] });
});

test("reports a removed test without assertion lines", () => {
  const path = "test/pomelo-example.test.ts";
  assert.deepEqual(findDroppedChecks([{
    path,
    removedLines: lines(3, 'test("runs setup", () => setup());'),
    addedLines: [],
  }]), {
    ok: false,
    hits: [{ path, removed: 0, added: 0, removedLines: [], removedTests: ["runs setup"] }],
  });
});

test("accepts an empty change list", () => {
  assert.deepEqual(findDroppedChecks([]), { ok: true, hits: [] });
});
