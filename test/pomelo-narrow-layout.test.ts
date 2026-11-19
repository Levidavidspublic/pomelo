import assert from "node:assert/strict";
import test from "node:test";
import { NARROW_PX } from "../src/client/narrow.js";
import { narrowLayout } from "../src/client/pomelo/narrow-layout.js";
import { nextPanel, SIDE_PANELS } from "../src/client/pomelo/side-panel.js";

const phoneWidth = 390;

test("a wide window shows all three columns with no layout back target", () => {
  assert.deepEqual(narrowLayout({
    width: NARROW_PX + 1, view: "chat", threadOpen: true, panelOpen: null,
  }), {
    narrow: false,
    show: { rail: true, chat: true, panel: true },
    back: null,
    focus: "chat",
  });
});

test("a narrow window with no open thread shows only the rail", () => {
  assert.deepEqual(narrowLayout({
    width: phoneWidth, view: "panel", threadOpen: false, panelOpen: "work",
  }), {
    narrow: true,
    show: { rail: true, chat: false, panel: false },
    back: null,
    focus: "rail",
  });
});

test("opening a thread from the narrow rail shows and focuses the chat", () => {
  const rail = narrowLayout({ width: phoneWidth, view: "rail", threadOpen: false, panelOpen: null });
  assert.equal(rail.focus, "rail");

  assert.deepEqual(narrowLayout({
    width: phoneWidth, view: "chat", threadOpen: true, panelOpen: null,
  }), {
    narrow: true,
    show: { rail: false, chat: true, panel: false },
    back: "rail",
    focus: "chat",
  });
});

test("opening a side panel on narrow shows and focuses only the panel", () => {
  for (const event of ["card-tapped", "subagent-tapped", "job-started"] as const) {
    const panelOpen = nextPanel(null, event, SIDE_PANELS);
    assert.deepEqual(narrowLayout({
      width: phoneWidth, view: "panel", threadOpen: true, panelOpen,
    }), {
      narrow: true,
      show: { rail: false, chat: false, panel: true },
      back: "chat",
      focus: "panel",
    }, event);
  }
});

test("back moves from panel to chat to rail with the thread still open", () => {
  const state = { width: phoneWidth, threadOpen: true, panelOpen: "artifact" } as const;
  const panel = narrowLayout({ ...state, view: "panel" });
  assert.equal(panel.back, "chat");

  const chat = narrowLayout({ ...state, view: panel.back });
  assert.equal(chat.focus, "chat");
  assert.equal(chat.back, "rail");

  const rail = narrowLayout({ ...state, view: chat.back });
  assert.deepEqual(rail.show, { rail: true, chat: false, panel: false });
  assert.equal(rail.focus, "rail");
  assert.equal(rail.back, null);
});

test("a closed panel falls back to chat when a thread is open", () => {
  const layout = narrowLayout({ width: phoneWidth, view: "panel", threadOpen: true, panelOpen: null });
  assert.deepEqual(layout.show, { rail: false, chat: true, panel: false });
  assert.equal(layout.focus, "chat");
  assert.equal(layout.back, "rail");
});

test("the focus target is visible for every layout input", () => {
  for (const width of [phoneWidth, NARROW_PX, NARROW_PX + 1]) {
    for (const view of ["rail", "chat", "panel"] as const) {
      for (const threadOpen of [false, true]) {
        for (const panelOpen of [null, ...SIDE_PANELS]) {
          const { show, focus } = narrowLayout({ width, view, threadOpen, panelOpen });
          assert.equal(show[focus], true);
        }
      }
    }
  }
});

test("the exact Friday breakpoint still uses the narrow layout", () => {
  const layout = narrowLayout({ width: NARROW_PX, view: "chat", threadOpen: true, panelOpen: null });
  assert.equal(layout.narrow, true);
  assert.deepEqual(layout.show, { rail: false, chat: true, panel: false });
});

test("resizing keeps the open thread and selected panel tab", () => {
  for (const panelOpen of SIDE_PANELS) {
    const state = Object.freeze({ width: phoneWidth, view: "panel", threadOpen: true, panelOpen } as const);
    const narrow = narrowLayout(state);
    const wide = narrowLayout(Object.freeze({ ...state, width: NARROW_PX + 1 }));

    assert.deepEqual(wide.show, { rail: true, chat: true, panel: true });
    assert.equal(wide.focus, "panel");
    assert.deepEqual(narrowLayout(state), narrow);
  }
});
