import assert from "node:assert/strict";
import test from "node:test";
import { threadOrigin, type ThreadOriginInput } from "../src/client/pomelo/thread-origin.js";

const root = { sid: "root", title: "Planning", openedBy: "amit" };
const child = { sid: "child", title: "Research", openedBy: "Researcher", parentThreadId: root.sid };
const grandchild = { sid: "grandchild", title: "Draft", parentThreadId: child.sid };

test("Amit and older threads without opener metadata have no origin label", () => {
  for (const thread of [root, { sid: "legacy", title: "Older thread" }]) {
    assert.deepEqual(threadOrigin(thread, new Map()), {
      openedByLabel: null,
      parent: null,
      trail: [],
      note: null,
    });
  }
});

test("an agent-opened thread names the agent even without a parent", () => {
  const thread = { sid: "solo", title: "Research", openedBy: "Researcher" };
  assert.equal(threadOrigin(thread, new Map()).openedByLabel, "Opened by Researcher");
});

test("a child links to its immediate parent", () => {
  const link = { sid: root.sid, title: root.title };
  assert.deepEqual(threadOrigin(child, new Map([[root.sid, root]])), {
    openedByLabel: "Opened by Researcher",
    parent: link,
    trail: [link],
    note: null,
  });
});

test("a grandchild lists its ancestors oldest first", () => {
  const threadsById = new Map<string, ThreadOriginInput>([[root.sid, root], [child.sid, child]]);
  const parent = { sid: child.sid, title: child.title };
  assert.deepEqual(threadOrigin(grandchild, threadsById), {
    openedByLabel: null,
    parent,
    trail: [{ sid: root.sid, title: root.title }, parent],
    note: null,
  });
});

test("a missing immediate parent leaves no link and gives a note", () => {
  assert.deepEqual(threadOrigin(child, new Map()), {
    openedByLabel: "Opened by Researcher",
    parent: null,
    trail: [],
    note: "parent thread not found",
  });
});

test("a missing older ancestor keeps the immediate parent link and gives a note", () => {
  const parent = { sid: child.sid, title: child.title };
  assert.deepEqual(threadOrigin(grandchild, new Map([[child.sid, child]])), {
    openedByLabel: null,
    parent,
    trail: [parent],
    note: "parent thread not found",
  });
});

test("a two-thread loop stops before adding the current thread to the trail", () => {
  const loopingRoot = { ...root, parentThreadId: child.sid };
  const threadsById = new Map([[root.sid, loopingRoot], [child.sid, child]]);
  const parent = { sid: root.sid, title: root.title };
  assert.deepEqual(threadOrigin(child, threadsById), {
    openedByLabel: "Opened by Researcher",
    parent,
    trail: [parent],
    note: "parent thread loop",
  });
});

test("a self-parent gives a loop note and no link", () => {
  const loopingRoot = { ...root, parentThreadId: root.sid };
  assert.deepEqual(threadOrigin(loopingRoot, new Map([[root.sid, loopingRoot]])), {
    openedByLabel: null,
    parent: null,
    trail: [],
    note: "parent thread loop",
  });
});

test("a deep chain keeps the eight nearest ancestors in oldest-first order", () => {
  const ancestors = Array.from({ length: 50 }, (_, index) => ({
    sid: `ancestor-${index}`,
    title: `Ancestor ${index}`,
    parentThreadId: index === 0 ? undefined : `ancestor-${index - 1}`,
  }));
  const threadsById = new Map(ancestors.map((thread) => [thread.sid, Object.freeze(thread)]));
  const result = threadOrigin({ ...child, parentThreadId: "ancestor-49" }, threadsById);

  assert.deepEqual(result.parent, { sid: "ancestor-49", title: "Ancestor 49" });
  assert.deepEqual(result.trail, ancestors.slice(-8).map(({ sid, title }) => ({ sid, title })));
  assert.equal(result.note, null);
});

test("Hebrew titles keep their original characters and order", () => {
  const title = "תִּכְנוּן הפרויקט";
  const result = threadOrigin(child, new Map([[root.sid, { ...root, title }]]));
  assert.equal(result.parent?.title, title);
  assert.equal(result.trail[0].title, title);
});

test("parent titles are trimmed and clipped at 120 code units without splitting a grapheme", () => {
  const title = `  ${"א".repeat(119)}בּ המשך  `;
  const result = threadOrigin(child, new Map([[root.sid, { ...root, title }]]));
  const expected = "א".repeat(119);
  assert.equal(result.parent?.title, expected);
  assert.equal(result.trail[0].title, expected);

  const overlong = threadOrigin(child, new Map([[root.sid, { ...root, title: "x".repeat(200) }]]));
  assert.equal(overlong.parent?.title, "x".repeat(120));
});
