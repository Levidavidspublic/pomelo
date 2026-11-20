import assert from "node:assert/strict";
import test from "node:test";
import { takeoverBar } from "../src/client/pomelo/takeover-bar.js";

const agent = Object.freeze({ driver: "agent", pageChangedSinceTakeOver: false } as const);
const amit = Object.freeze({ driver: "amit", takenAt: 10, pageChangedSinceTakeOver: false } as const);
const handedBack = Object.freeze({ ...agent, takenAt: 10, handedBackAt: 20 });
const agentBar = {
  line: "The agent is driving",
  action: "take_over",
  actionLabel: "Take over",
  note: null,
  dir: "ltr",
} as const;
const amitBar = {
  line: "You are driving",
  action: "hand_back",
  actionLabel: "Hand back",
  note: null,
  dir: "ltr",
} as const;
const noAction = { action: null, actionLabel: null, note: null, dir: "ltr" } as const;

test("offers Take over while the agent is driving a running job", () => {
  assert.deepEqual(takeoverBar({ state: agent, jobState: "running" }), agentBar);
});

test("offers Hand back while Amit is driving a running job", () => {
  assert.deepEqual(takeoverBar({ state: amit, jobState: "running" }), amitBar);
});

test("warns that the agent will read the page again if it changed during manual control", () => {
  const state = { ...amit, pageChangedSinceTakeOver: true };
  assert.deepEqual(takeoverBar({ state, jobState: "running" }), {
    ...amitBar,
    note: "The agent will read the page again before it carries on",
  });
});

test("warns that a fill or import needs new approval after hand-back", () => {
  assert.deepEqual(takeoverBar({ state: handedBack, jobState: "running" }), {
    ...agentBar,
    note: "A fill or import will need a new approval",
  });
});

test("shows both warnings after handing back a changed page", () => {
  const state = { ...handedBack, pageChangedSinceTakeOver: true };
  assert.deepEqual(takeoverBar({ state, jobState: "running" }), {
    ...agentBar,
    note: "The agent will read the page again before it carries on. A fill or import will need a new approval",
  });
});

test("terminal jobs give the ended line with no action or warning", () => {
  for (const jobState of ["done", "failed", "cancelled"]) {
    for (const state of [agent, amit, handedBack, null]) {
      assert.deepEqual(takeoverBar({ state, jobState }), { ...noAction, line: "This job has ended" });
    }
  }
});

test("missing or malformed control state gives the unknown line with no action", () => {
  const malformed = [
    undefined,
    null,
    "agent",
    { ...agent, driver: "other" },
    { driver: "agent" },
    { ...agent, pageChangedSinceTakeOver: "true" },
    { ...agent, takenAt: Infinity },
    { ...agent, handedBackAt: "20" },
    { ...amit, handedBackAt: 20 },
    { ...handedBack, handedBackAt: 5 },
  ];
  for (const state of malformed) {
    assert.deepEqual(takeoverBar({ state, jobState: "running" }), {
      ...noAction,
      line: "Browser control is not known",
    });
  }
});

test("Hebrew uses fixed right-to-left status lines, action labels, and warnings", () => {
  const agentHebrew = { ...agentBar, line: "השליטה בדפדפן אצל הסוכן", actionLabel: "לקחת שליטה", dir: "rtl" };
  assert.deepEqual(takeoverBar({ state: agent, jobState: "running", lang: "he" }), agentHebrew);
  assert.deepEqual(takeoverBar({ state: { ...amit, pageChangedSinceTakeOver: true }, jobState: "running", lang: "he" }), {
    ...amitBar,
    line: "השליטה בדפדפן אצלך",
    actionLabel: "להחזיר שליטה",
    note: "הסוכן יקרא שוב את הדף לפני שימשיך",
    dir: "rtl",
  });
  assert.deepEqual(takeoverBar({ state: handedBack, jobState: "running", lang: "HE-il" }), {
    ...agentHebrew,
    note: "למילוי או לייבוא יידרש אישור חדש",
  });
  const changed = { ...handedBack, pageChangedSinceTakeOver: true };
  assert.deepEqual(takeoverBar({ state: changed, jobState: "running", lang: "he" }), {
    ...agentHebrew,
    note: "הסוכן יקרא שוב את הדף לפני שימשיך. למילוי או לייבוא יידרש אישור חדש",
  });
  assert.deepEqual(takeoverBar({ state: agent, jobState: "done", lang: "he" }), {
    ...noAction,
    line: "המשימה הסתיימה",
    dir: "rtl",
  });
  assert.deepEqual(takeoverBar({ state: null, jobState: "running", lang: "he" }), {
    ...noAction,
    line: "לא ידוע מי שולט בדפדפן",
    dir: "rtl",
  });
});

test("an unsupported language uses the English copy", () => {
  assert.deepEqual(takeoverBar({ state: agent, jobState: "running", lang: "fr" }), agentBar);
});

test("extra fields can never supply text for the bar", () => {
  const state = {
    ...agent,
    note: "synthetic-takeover-canary",
    pageText: "sample page text",
    address: "https://example.invalid/",
  };
  const result = takeoverBar({ state, jobState: "running" });
  assert.deepEqual(result, agentBar);
  const serialized = JSON.stringify(result);
  for (const value of [state.note, state.pageText, state.address]) {
    assert.equal(serialized.includes(value), false);
  }
});
