import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  keepThreadMeta,
  resetThreadMetaForTest,
  subscribeThreadMeta,
  threadMetaSnapshot,
} from "../src/client/pomelo/thread-meta-store.js";

beforeEach(resetThreadMetaForTest);

test("keeps only thread metadata for rows with a string sid", () => {
  const meta = {
    projectTags: ["docs", "review"],
    lastActivityAt: 20,
    openedBy: "agent:research",
    parentThreadId: "parent",
  };
  keepThreadMeta([
    { sid: "child", title: "Review the draft", at: 10, ...meta },
    { sid: "parent", title: "Plan" },
    { title: "Missing sid", lastActivityAt: 30 },
    { sid: 42 },
    null,
  ]);

  const snapshot = threadMetaSnapshot();
  assert.deepEqual(Object.keys(snapshot), ["child", "parent"]);
  assert.deepEqual(snapshot.child, meta);
  assert.deepEqual(snapshot.parent, {});
});

test("trims tags, drops blanks and non-strings, and keeps the first 20 distinct tags", () => {
  const tags = Array.from({ length: 22 }, (_, index) => `tag-${index}`);
  keepThreadMeta([{ sid: "thread", projectTags: [null, 1, "", " \t ", " tag-0 ", ...tags] }]);

  assert.deepEqual(threadMetaSnapshot().thread?.projectTags, tags.slice(0, 20));
});

test("omits invalid or empty metadata fields", () => {
  keepThreadMeta([
    { sid: "nan", lastActivityAt: NaN, openedBy: "", parentThreadId: "" },
    { sid: "string", lastActivityAt: "20", openedBy: 1, parentThreadId: false, projectTags: "docs" },
    { sid: "infinity", lastActivityAt: Infinity },
    { sid: "zero", lastActivityAt: 0, projectTags: [] },
  ]);

  const snapshot = threadMetaSnapshot();
  for (const sid of ["nan", "string", "infinity"]) assert.deepEqual(snapshot[sid], {});
  assert.deepEqual(snapshot.zero, { lastActivityAt: 0, projectTags: [] });
});

test("stores prototype names as ordinary session IDs", () => {
  keepThreadMeta([
    { sid: "__proto__", openedBy: "agent" },
    { sid: "constructor", parentThreadId: "parent" },
  ]);

  const snapshot = threadMetaSnapshot();
  assert.equal(Object.getPrototypeOf(snapshot), null);
  assert.ok(Object.hasOwn(snapshot, "__proto__"));
  assert.deepEqual(snapshot["__proto__"], { openedBy: "agent" });
  assert.ok(Object.hasOwn(snapshot, "constructor"));
  assert.deepEqual(snapshot["constructor"], { parentThreadId: "parent" });
  assert.equal(snapshot.toString, undefined);
});

test("keeps the same snapshot and stays silent when metadata is unchanged", () => {
  keepThreadMeta([{ sid: "first", projectTags: ["docs"], title: "Old title" }, { sid: "second" }]);
  const snapshot = threadMetaSnapshot();
  let calls = 0;
  subscribeThreadMeta(() => calls++);

  keepThreadMeta([{ sid: "second" }, { sid: "first", projectTags: [" docs ", "docs"], title: "New title" }]);

  assert.equal(threadMetaSnapshot(), snapshot);
  assert.equal(calls, 0);
});

test("publishes updated tags once to each subscribed listener", () => {
  keepThreadMeta([{ sid: "thread", projectTags: ["docs"] }]);
  const original = threadMetaSnapshot();
  const seen: (readonly string[] | undefined)[] = [];
  let calls = 0;
  subscribeThreadMeta(() => seen.push(threadMetaSnapshot().thread?.projectTags));
  const unsubscribe = subscribeThreadMeta(() => calls++);

  keepThreadMeta([{ sid: "thread", projectTags: ["review"] }]);

  assert.notEqual(threadMetaSnapshot(), original);
  assert.deepEqual(seen, [["review"]]);
  assert.equal(calls, 1);

  unsubscribe();
  keepThreadMeta([]);

  assert.deepEqual(seen, [["review"], undefined]);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(threadMetaSnapshot()), []);
});

test("ignores non-array input without changing the snapshot", () => {
  keepThreadMeta([{ sid: "thread", lastActivityAt: 20 }]);
  const snapshot = threadMetaSnapshot();
  let calls = 0;
  subscribeThreadMeta(() => calls++);

  assert.doesNotThrow(() => keepThreadMeta(null));
  assert.doesNotThrow(() => keepThreadMeta("x"));
  assert.equal(threadMetaSnapshot(), snapshot);
  assert.equal(calls, 0);
});

test("keeps the previous snapshot if reading a row throws", () => {
  keepThreadMeta([{ sid: "thread", lastActivityAt: 20 }]);
  const snapshot = threadMetaSnapshot();
  const unreadableRow = {
    sid: "unreadable",
    get projectTags() { throw new Error("unreadable tags"); },
  };

  assert.doesNotThrow(() => keepThreadMeta([{ sid: "new" }, unreadableRow]));
  assert.equal(threadMetaSnapshot(), snapshot);
});

test("a throwing listener does not interrupt delivery to other listeners", () => {
  subscribeThreadMeta(() => { throw new Error("listener failed"); });
  let calls = 0;
  subscribeThreadMeta(() => calls++);

  assert.doesNotThrow(() => keepThreadMeta([{ sid: "thread" }]));
  assert.equal(calls, 1);
});

test("publishes frozen metadata and copies the input tags", () => {
  const projectTags = ["docs"];
  keepThreadMeta([{ sid: "thread", projectTags }]);
  const snapshot = threadMetaSnapshot();
  projectTags.push("review");

  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.thread));
  assert.ok(Object.isFrozen(snapshot.thread?.projectTags));
  assert.deepEqual(snapshot.thread?.projectTags, ["docs"]);
});
