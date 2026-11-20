import assert from "node:assert/strict";
import { test } from "node:test";
import { homeStartReducer, homeStartRequest, initialHomeStart, type HomeStartState } from "../src/client/pomelo/home-start.js";

function draft(text: string): HomeStartState {
  return homeStartReducer(initialHomeStart(), { type: "type", text });
}

function send(state: HomeStartState) {
  const request = homeStartRequest(state);
  return { request, state: homeStartReducer(state, { type: "send" }) };
}

test("sending a typed message starts with trimmed text and no project tags", () => {
  const { request, state } = send(draft(" \tReview the plan.\n"));
  assert.deepEqual(request, { text: "Review the plan.", projectTags: [], openedBy: "person" });
  assert.equal(state.status, "sending");
});

test("empty and whitespace-only messages produce no start request", () => {
  for (const text of ["", " \t\n\u00a0 "]) {
    const state = homeStartReducer(draft(text), { type: "pickChip", slug: "planning" });
    assert.deepEqual(send(state), { request: null, state });
  }
});

test("only the most recently picked chip becomes a starting tag", () => {
  const previous = homeStartReducer(draft("Review the plan."), { type: "pickChip", slug: "notes" });
  const picked = homeStartReducer(previous, { type: "pickChip", slug: "planning" });
  assert.deepEqual(send(picked).request, {
    text: "Review the plan.", projectTags: ["planning"], openedBy: "person",
  });
});

test("clearing the chip leaves the message with no starting tags", () => {
  const picked = homeStartReducer(draft("Review the plan."), { type: "pickChip", slug: "planning" });
  const cleared = homeStartReducer(picked, { type: "clearChip" });
  assert.deepEqual(send(cleared).request, { text: "Review the plan.", projectTags: [], openedBy: "person" });
});

test("a second press while sending produces no second request", () => {
  const first = send(draft("Review the plan."));
  assert.ok(first.request);
  assert.deepEqual(send(first.state), { request: null, state: first.state });
});

test("a successful start clears the draft and exposes the new thread id", () => {
  const picked = homeStartReducer(draft("Review the plan."), { type: "pickChip", slug: "planning" });
  const started = homeStartReducer(send(picked).state, { type: "started", threadId: "thread-1" });
  assert.deepEqual(started, { status: "started", text: "", projectTag: null, threadId: "thread-1" });
  assert.equal(homeStartRequest(started), null);
});

test("a failed start keeps the draft and plain reason and allows another send", () => {
  const text = "  Review the plan.\n";
  const picked = homeStartReducer(draft(text), { type: "pickChip", slug: "planning" });
  const first = send(picked);
  const pending = homeStartReducer(first.state, { type: "clearChip" });
  const reason = "Could not start the thread.";
  const failed = homeStartReducer(pending, { type: "failed", reason });
  assert.deepEqual(failed, { status: "failed", text, projectTag: "planning", reason });
  assert.deepEqual(send(failed), first);
});

test("Hebrew and mixed Hebrew and English keep their original UTF-8 bytes", () => {
  for (const text of ["שָׁלוֹם, עוֹלָם!", "בדקו את Plan A (שלב 2).\nתודה!"]) {
    const { request } = send(draft(text));
    assert.ok(request);
    assert.deepEqual(Buffer.from(request.text, "utf8"), Buffer.from(text, "utf8"));
    assert.equal(request.openedBy, "person");
  }
});
