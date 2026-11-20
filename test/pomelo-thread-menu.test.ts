import assert from "node:assert/strict";
import test from "node:test";
import { threadMenu, type ThreadMenuInput } from "../src/client/pomelo/thread-menu.js";

const plain: ThreadMenuInput = {
  archived: false,
  runningLanes: 0,
  openedBy: "user",
  hasParent: false,
  isSubagentLane: false,
  busy: false,
};

test("a plain thread offers retag, copy link and put away in order", () => {
  assert.deepEqual(threadMenu(plain), [
    { id: "retag", label: "Retag", enabled: true, danger: false },
    { id: "copy-link", label: "Copy link", enabled: true, danger: false },
    { id: "archive", label: "Put away", enabled: true, danger: false },
  ]);
});

test("an archived thread offers bring back in the put-away slot", () => {
  const menu = threadMenu({ ...plain, archived: true });
  assert.deepEqual(menu.map(({ id }) => id), ["retag", "copy-link", "unarchive"]);
  assert.deepEqual(menu[2], { id: "unarchive", label: "Bring back", enabled: true, danger: false });
});

test("a parent link and the counted stop action have fixed positions", () => {
  for (const [runningLanes, label] of [[1, "Stop 1 sub-agent"], [3, "Stop 3 sub-agents"]] as const) {
    const menu = threadMenu({ ...plain, openedBy: "researcher", hasParent: true, runningLanes });
    assert.deepEqual(menu.map(({ id }) => id), ["retag", "copy-link", "open-parent", "archive", "stop-subagents"]);
    assert.deepEqual(menu[2], { id: "open-parent", label: "Open parent thread", enabled: true, danger: false });
    assert.equal(menu[0]?.enabled, true);
    assert.deepEqual(menu[4], { id: "stop-subagents", label, enabled: true, danger: true });
  }
});

test("zero or invalid lane counts leave out the stop action", () => {
  for (const runningLanes of [0, -1, NaN, Infinity, 0.5]) {
    assert.deepEqual(threadMenu({ ...plain, runningLanes }), threadMenu(plain));
  }
});

test("a sub-agent lane shows why retag is unavailable", () => {
  const retag = threadMenu({ ...plain, isSubagentLane: true })[0];
  assert.equal(retag?.id, "retag");
  assert.equal(retag?.enabled, false);
  assert.match(retag?.reason ?? "", /sub-agent/i);
});

test("a busy thread keeps its menu order, links and stop action", () => {
  for (const archived of [false, true]) {
    const input = { ...plain, archived, hasParent: true, runningLanes: 2 };
    const menu = threadMenu({ ...input, busy: true });
    assert.deepEqual(menu.map(({ id }) => id), threadMenu(input).map(({ id }) => id));
    assert.deepEqual(menu.filter(({ enabled }) => enabled).map(({ id }) => id), [
      "copy-link", "open-parent", "stop-subagents",
    ]);
  }
});

test("all disabled items have a reason and the menu never offers deletion", () => {
  for (const archived of [false, true]) {
    for (const busy of [false, true]) {
      for (const isSubagentLane of [false, true]) {
        const menu = threadMenu({ ...plain, archived, busy, isSubagentLane, hasParent: true, runningLanes: 1 });
        for (const { id, label, enabled, reason } of menu) {
          assert.doesNotMatch(id, /delete/i);
          assert.doesNotMatch(label, /delete/i);
          if (!enabled) assert.match(reason ?? "", /\S/, id);
        }
      }
    }
  }
});
