import assert from "node:assert/strict";
import { test } from "node:test";
import { pageThreads, parseThreadCursor, type ThreadPageRow } from "../src/pomelo/thread-page.js";

function walkPages(rows: readonly ThreadPageRow[], limit?: number): string[][] {
  const pages: string[][] = [];
  let cursor: string | undefined;
  do {
    assert.ok(pages.length <= rows.length, "pagination must terminate");
    const page = pageThreads(rows, { limit, cursor });
    assert.equal(page.cursorRejected, undefined);
    pages.push(page.rows.map(({ sid }) => sid));
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return pages;
}

test("threads sort by newest activity and then by sid without changing the input", () => {
  const rows = Object.freeze([
    { sid: "older", lastActivityAt: 10 },
    { sid: "b", lastActivityAt: 20 },
    { sid: "newest", lastActivityAt: 30 },
    { sid: "a", lastActivityAt: 20 },
    { sid: "A", lastActivityAt: 20 },
  ]);
  const page = pageThreads(rows);
  assert.deepEqual(page.rows.map(({ sid }) => sid), ["newest", "A", "a", "b", "older"]);
  assert.equal(page.rows[0], rows[2]);
  assert.equal(page.nextCursor, null);
});

test("the default limit is 30 and requested limits clamp from 1 to 100", () => {
  const rows = Array.from({ length: 105 }, (_, i) => ({ sid: `s-${i}`, lastActivityAt: i }));
  for (const [limit, size] of [[undefined, 30], [0, 1], [1, 1], [100, 100], [1000, 100]] as const) {
    const page = pageThreads(rows, { limit });
    assert.equal(page.rows.length, size);
    assert.ok(page.nextCursor);
  }
});

test("walking a fixed list of 95 rows returns every sid once", () => {
  const rows = Array.from({ length: 95 }, (_, i) => ({ sid: `s-${i}`, lastActivityAt: i }));
  const pages = walkPages(rows);
  assert.deepEqual(pages.map((page) => page.length), [30, 30, 30, 5]);
  assert.deepEqual(pages.flat(), rows.map(({ sid }) => sid).reverse());
  assert.equal(new Set(pages.flat()).size, 95);
});

test("equal activity timestamps across a page edge keep every sid in order", () => {
  const rows = ["d", "a", "c", "b"].map((sid) => ({ sid, lastActivityAt: 10 }));
  assert.deepEqual(walkPages(rows, 2), [["a", "b"], ["c", "d"]]);
});

test("a shown thread that moves to the top leaves the page boundary where it was", () => {
  const rows = [
    { sid: "a", lastActivityAt: 40 },
    { sid: "b", lastActivityAt: 30 },
    { sid: "c", lastActivityAt: 20 },
    { sid: "d", lastActivityAt: 10 },
  ];
  const first = pageThreads(rows, { limit: 2 });
  assert.deepEqual(first.rows.map(({ sid }) => sid), ["a", "b"]);
  assert.ok(first.nextCursor);
  const updated = rows.map((row) => row.sid === "b" ? { ...row, lastActivityAt: 50 } : row);
  const second = pageThreads(updated, { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second, { rows: rows.slice(2), nextCursor: null });
});

test("missing and invalid activity sorts last and still pages by sid", () => {
  const rows = [
    { sid: "e", lastActivityAt: NaN },
    { sid: "b", lastActivityAt: "100" },
    { sid: "a" },
    { sid: "z", lastActivityAt: 0 },
    { sid: "c", lastActivityAt: null },
    { sid: "d", lastActivityAt: Infinity },
    { sid: "y", lastActivityAt: -10 },
  ];
  assert.deepEqual(walkPages(rows, 2), [["z", "y"], ["a", "b"], ["c", "d"], ["e"]]);
});

test("an empty list has no rows and no next cursor", () => {
  assert.deepEqual(pageThreads([]), { rows: [], nextCursor: null });
});

test("tampered, empty, oversized and non-string cursors safely fall back to page one", () => {
  const rows = [
    { sid: "a", lastActivityAt: 53_849 },
    { sid: "b", lastActivityAt: 53_848 },
  ];
  const first = pageThreads(rows, { limit: 1 });
  assert.ok(first.nextCursor);
  const tampered = first.nextCursor.replace("53849", "53848");
  assert.notEqual(tampered, first.nextCursor);
  for (const cursor of [tampered, `${first.nextCursor}x`, "", "%", "x".repeat(10_000), 123, null, {}]) {
    assert.equal(parseThreadCursor(cursor), null);
    assert.deepEqual(pageThreads(rows, { limit: 1, cursor }), { ...first, cursorRejected: true });
  }
});

test("the cursor round trips the page boundary without the thread title or tags", () => {
  const title = "Sample thread title";
  const tag = "sample-project-tag";
  const rows = [
    { sid: "a_b-c", lastActivityAt: 20, title, projectTags: [tag] },
    { sid: "older", lastActivityAt: 10 },
  ];
  const { nextCursor } = pageThreads(rows, { limit: 1 });
  assert.ok(nextCursor);
  assert.deepEqual(parseThreadCursor(nextCursor), { sid: "a_b-c", lastActivityAt: 20 });
  assert.ok(!decodeURIComponent(nextCursor).includes(title));
  assert.ok(!decodeURIComponent(nextCursor).includes(tag));
  assert.equal(pageThreads([{ ...rows[0], title: "Changed title", projectTags: [] }, rows[1]], { limit: 1 }).nextCursor, nextCursor);
});
