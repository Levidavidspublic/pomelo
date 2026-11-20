import assert from "node:assert/strict";
import test from "node:test";
import { checkDiffSize } from "../src/pomelo/diff-size.js";

test("passes a small PR and counts additions and removals across the whole diff", () => {
  const numstat = ["12\t4\tsrc/pomelo/room.ts", "30\t2\ttest/room.test.ts", "3\t1\tdocs/guide.md"].join("\n");

  assert.deepEqual(checkDiffSize(numstat), {
    ok: true,
    totalAdded: 45,
    totalRemoved: 7,
    overLimit: [],
    reasons: [],
  });
});

test("names a Pomelo source file over 400 additions even with more removals", () => {
  const path = "src/client/pomelo/panel.tsx";
  const result = checkDiffSize(`401\t450\t${path}`);

  assert.equal(result.ok, false);
  assert.deepEqual(result.overLimit, [{ path, added: 401, limit: 400 }]);
  assert.ok(result.reasons.some((reason) => reason.includes(path)));
});

test("allows exactly 600 additions in a test file and 400 in a source file", () => {
  const path = "test/room.test.ts";
  const source = "400\t0\tsrc/pomelo/room.ts";

  assert.equal(checkDiffSize(`600\t0\t${path}\n${source}`).ok, true);
  assert.deepEqual(checkDiffSize(`601\t0\t${path}\n${source}`).overLimit, [{ path, added: 601, limit: 600 }]);
});

test("fails when the PR exceeds 1200 additions even if each file is below its limit", () => {
  const numstat = (docAdded: number) => [
    "399\t0\tsrc/pomelo/alpha.ts",
    "399\t0\tsrc/pomelo/beta.ts",
    "399\t0\tsrc/pomelo/gamma.ts",
    `${docAdded}\t0\tdocs/guide.md`,
  ].join("\n");

  assert.equal(checkDiffSize(numstat(3)).ok, true);
  const result = checkDiffSize(numstat(4));
  assert.equal(result.ok, false);
  assert.equal(result.totalAdded, 1201);
  assert.deepEqual(result.overLimit, []);
  assert.match(result.reasons.join(" "), /1201.*1200/);
});

test("lists binary rows and counts only known additions and removals", () => {
  const path = "src/pomelo/icon.png";
  const result = checkDiffSize(`-\t-\t${path}\n10\t3\tsrc/pomelo/room.ts`);

  assert.equal(result.ok, false);
  assert.equal(result.totalAdded, 10);
  assert.equal(result.totalRemoved, 3);
  assert.deepEqual(result.overLimit, [{ path, added: "binary", limit: 400 }]);
  assert.match(result.reasons.join(" "), /binary/i);
  assert.equal(checkDiffSize("-\t-\tassets/icon.png").ok, false);
});

test("checks the destination path for full and compact renames", () => {
  const numstat = [
    "401\t0\told.ts => src/pomelo/new.ts",
    "601\t0\t{legacy => test}/new.test.ts",
    "401\t0\tsrc/pomelo/{archive => }/panel.ts",
  ].join("\n");

  assert.deepEqual(checkDiffSize(numstat).overLimit, [
    { path: "src/pomelo/new.ts", added: 401, limit: 400 },
    { path: "src/pomelo/panel.ts", added: 401, limit: 400 },
    { path: "test/new.test.ts", added: 601, limit: 600 },
  ]);
  assert.equal(checkDiffSize("401\t0\tsrc/pomelo/old.ts => docs/new.md").ok, true);
  assert.deepEqual(checkDiffSize("401\t0\told{.ts => src/pomelo/new}.ts").overLimit, [
    { path: "src/pomelo/new}.ts", added: 401, limit: 400 },
  ]);
});

test("decodes Git-quoted destinations and preserves spaces in paths", () => {
  const numstat = [
    '401\t0\t"src/pomelo/caf\\303\\251.ts"',
    '401\t0\told.ts => "src/pomelo/room \\042copy\\042.ts"',
    '401\t0\t"src/{caf\\303\\251 => pomelo}/z.ts"',
  ].join("\n");

  assert.deepEqual(checkDiffSize(numstat).overLimit, [
    { path: "src/pomelo/café.ts", added: 401, limit: 400 },
    { path: 'src/pomelo/room "copy".ts', added: 401, limit: 400 },
    { path: "src/pomelo/z.ts", added: 401, limit: 400 },
  ]);
});

test("accepts Windows line endings", () => {
  const result = checkDiffSize("1\t2\tsrc/pomelo/alpha.ts\r\n3\t4\tsrc/pomelo/beta.ts\r\n");

  assert.equal(result.ok, true);
  assert.equal(result.totalAdded, 4);
  assert.equal(result.totalRemoved, 6);
});

test("fails with a reason for empty, malformed, or partly unreadable input", () => {
  for (const numstat of [
    "", "\r\n   \r\n", "garbage", "1\t0\tsrc/pomelo/room.ts\ngarbage",
    "1e3\t0\tsrc/pomelo/room.ts", "-\t0\tsrc/pomelo/room.ts", "1\t0\t",
    "9007199254740992\t0\tsrc/pomelo/room.ts",
  ]) {
    const result = checkDiffSize(numstat);
    assert.equal(result.ok, false, JSON.stringify(numstat));
    assert.ok(result.reasons.length > 0);
  }
});

test("uses custom limits and retains defaults for omitted limits", () => {
  const numstat = "4\t0\tsrc/pomelo/room.ts\n5\t0\ttest/room.test.ts";
  const result = checkDiffSize(numstat, { sourceFile: 3, testFile: 4, totalAdded: 8 });

  assert.equal(result.ok, false);
  assert.deepEqual(result.overLimit, [
    { path: "src/pomelo/room.ts", added: 4, limit: 3 },
    { path: "test/room.test.ts", added: 5, limit: 4 },
  ]);
  assert.equal(result.reasons.length, 3);
  assert.equal(checkDiffSize(numstat, { totalAdded: 9 }).ok, true);
  assert.equal(checkDiffSize("1\t0\tsrc/pomelo/room.ts", { sourceFile: 0 }).ok, false);
});
